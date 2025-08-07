"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TopicForm } from "../components/TopicForm";
import { useDebateStore } from "../lib/stores/debate-store";
import { Brain, Zap, Users, Trophy } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const { createDebate } = useDebateStore();

  const handleCreateDebate = async (request: any) => {
    setIsCreating(true);
    try {
      const sessionId = await createDebate(request);
      router.push(`/debate/${sessionId}`);
    } catch (error) {
      console.error("Failed to create debate:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const MotionDiv = motion.div;

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12 pt-8">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                <Brain className="w-12 h-12 text-blue-600 dark:text-blue-400" />
              </div>
            </div>

            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
              AI Debate Club
            </h1>

            <p className="text-xl text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto">
              Watch AI personas debate in real-time with streaming text, TTS
              audio, animated avatars, and live judging
            </p>

            {/* Features */}
            <div className="grid md:grid-cols-3 gap-6 mb-12">
              <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <MotionDiv
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Zap className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                    Real-time Streaming
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Watch arguments unfold in real-time with streaming text and
                    instant audio playback
                  </p>
                </MotionDiv>
              </div>

              <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <MotionDiv
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Users className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                    AI Personas
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Choose from preset personas or create custom AI debaters
                    with unique styles
                  </p>
                </MotionDiv>
              </div>

              <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <MotionDiv
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Trophy className="w-8 h-8 text-purple-500 mx-auto mb-3" />
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                    Smart Judging
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Let AI judge automatically or vote manually with detailed
                    scoring breakdowns
                  </p>
                </MotionDiv>
              </div>
            </div>
          </MotionDiv>
        </div>

        {/* Topic Form */}
        <TopicForm onSubmit={handleCreateDebate} isLoading={isCreating} />

        {/* Footer */}
        <div className="text-center mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Powered by OpenAI GPT-4o and TTS • Built with Next.js and
              TypeScript
            </p>
          </MotionDiv>
        </div>
      </div>
    </div>
  );
}
