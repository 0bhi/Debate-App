"use client";

import { MessageSquare, Sparkles, Users, Zap, Shield, TrendingUp } from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    title: "Real-Time Debates",
    description:
      "Engage in live debates with instant messaging. Watch arguments unfold in real-time with seamless turn-taking.",
  },
  {
    icon: Sparkles,
    title: "AI-Powered Judge",
    description:
      "Get instant feedback from our AI judge. Analyze argument quality, logic, and persuasiveness to improve your skills.",
  },
  {
    icon: Users,
    title: "Challenge Friends",
    description:
      "Invite friends to debate on any topic. Build your network and compete with debaters from around the world.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description:
      "Experience instant responses and smooth interactions. No lag, no delays—just pure debating action.",
  },
  {
    icon: Shield,
    title: "Safe & Secure",
    description:
      "Your debates are private and secure. We protect your data and ensure respectful conversations.",
  },
  {
    icon: TrendingUp,
    title: "Track Progress",
    description:
      "Monitor your debate history and see how you improve over time. Review past arguments and learn from each session.",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Everything You Need to Debate Better
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Powerful features designed to help you articulate your thoughts
            clearly and win arguments
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="group p-8 bg-card rounded-xl border border-border hover:border-primary/50 transition-all duration-200 hover:shadow-lg"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

