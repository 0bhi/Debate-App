"use client";

import { motion } from "framer-motion";
import { Persona } from "../lib/validators";

interface AvatarProps {
  persona: Persona;
  isActive?: boolean;
  isSpeaking?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({
  persona,
  isActive = false,
  isSpeaking = false,
  size = "md",
  className = "",
}: AvatarProps) {
  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-32 h-32",
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
  };

  // Generate avatar based on persona name
  const getAvatarContent = (name: string) => {
    const initials = name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    // Color based on name hash
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-red-500",
      "bg-yellow-500",
      "bg-indigo-500",
      "bg-pink-500",
      "bg-teal-500",
    ];

    const hash = name.split("").reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);

    const colorClass = colors[Math.abs(hash) % colors.length];

    return { initials, colorClass };
  };

  const { initials, colorClass } = getAvatarContent(persona.name);

  return (
    <div className={`flex flex-col items-center space-y-2 ${className}`}>
      <motion.div
        className={`
          ${sizeClasses[size]} 
          ${colorClass}
          rounded-full flex items-center justify-center text-white font-bold
          ${textSizeClasses[size]}
          shadow-lg border-4 transition-all duration-300
          ${isActive ? "border-blue-400 shadow-blue-400/50" : "border-slate-300"}
          ${isSpeaking ? "shadow-xl scale-110" : ""}
        `}
        animate={
          isSpeaking
            ? {
                scale: [1, 1.05, 1],
                boxShadow: [
                  "0 10px 15px -3px rgba(59, 130, 246, 0.3)",
                  "0 20px 25px -5px rgba(59, 130, 246, 0.5)",
                  "0 10px 15px -3px rgba(59, 130, 246, 0.3)",
                ],
              }
            : {}
        }
        transition={{
          duration: 0.8,
          repeat: isSpeaking ? Infinity : 0,
          ease: "easeInOut",
        }}
      >
        {initials}
      </motion.div>

      <div className="text-center">
        <div
          className={`font-semibold text-slate-900 dark:text-white ${
            size === "sm" ? "text-sm" : size === "md" ? "text-base" : "text-lg"
          }`}
        >
          {persona.name}
        </div>

        {size !== "sm" && (
          <div className="text-xs text-slate-500 dark:text-slate-400 max-w-32 truncate">
            {persona.style.split(".")[0]}
          </div>
        )}
      </div>

      {/* Speaking indicator */}
      {isSpeaking && (
        <motion.div
          className="flex space-x-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-blue-500 rounded-full"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}
