#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🎯 Starting AI Debate Club setup...\n");

// Change to web directory
const webDir = path.join(__dirname, "apps", "web");
process.chdir(webDir);

console.log("📁 Working directory:", webDir);

// Check if .env exists, if not copy from example
if (!fs.existsSync(".env")) {
  if (fs.existsSync(".env.example")) {
    fs.copyFileSync(".env.example", ".env");
    console.log("✅ Created .env from example");
    console.log("⚠️  Please edit .env and add your OpenAI API key!");
  } else {
    console.log("❌ No .env.example found!");
    process.exit(1);
  }
} else {
  console.log("✅ .env already exists");
}

// Install dependencies
console.log("📦 Installing dependencies...");
try {
  execSync("npm install", { stdio: "inherit" });
  console.log("✅ Dependencies installed");
} catch (error) {
  console.log("❌ Failed to install dependencies");
  process.exit(1);
}

// Start Docker services
console.log("🐳 Starting Docker services...");
try {
  execSync("docker-compose up -d", { stdio: "inherit" });
  console.log("✅ Docker services started");
} catch (error) {
  console.log("❌ Failed to start Docker services");
  console.log("Make sure Docker is installed and running");
  process.exit(1);
}

// Wait for services to be ready
console.log("⏳ Waiting for services to start...");
setTimeout(() => {
  // Generate Prisma client
  console.log("🗄️  Generating Prisma client...");
  try {
    execSync("npx prisma generate", { stdio: "inherit" });
    console.log("✅ Prisma client generated");
  } catch (error) {
    console.log("❌ Failed to generate Prisma client");
    process.exit(1);
  }

  // Run database migrations
  console.log("🔄 Setting up database...");
  try {
    execSync("npx prisma migrate dev --name initial-setup", {
      stdio: "inherit",
    });
    console.log("✅ Database setup complete");
  } catch (error) {
    console.log("❌ Failed to setup database");
    process.exit(1);
  }

  console.log("\n🎉 Setup complete!");
  console.log("\n📝 Next steps:");
  console.log("1. Edit .env and add your OpenAI API key");
  console.log("2. The app is starting now at http://localhost:3000");
  console.log("\n🚀 Starting development servers...\n");

  // Start all development servers
  const child = spawn("npm", ["run", "dev:all"], {
    stdio: "inherit",
    shell: true,
  });

  // Handle process termination
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down...");
    child.kill("SIGINT");
    process.exit(0);
  });
}, 15000); // Wait 15 seconds for Docker services to start
