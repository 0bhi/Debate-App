"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Persona, CreateDebateRequest } from "../lib/validators";
import { PRESET_PERSONAS } from "../lib/stores/debate-store";
import toast from "react-hot-toast";

interface TopicFormProps {
  onSubmit: (request: CreateDebateRequest) => Promise<void>;
  isLoading?: boolean;
}

export function TopicForm({ onSubmit, isLoading = false }: TopicFormProps) {
  const [topic, setTopic] = useState("");
  const [personaA, setPersonaA] = useState<Persona>(
    PRESET_PERSONAS["steve-jobs"]
  );
  const [personaB, setPersonaB] = useState<Persona>(
    PRESET_PERSONAS["elon-musk"]
  );
  const [rounds, setRounds] = useState(2);
  const [autoJudge, setAutoJudge] = useState(true);
  const [customPersonaA, setCustomPersonaA] = useState(false);
  const [customPersonaB, setCustomPersonaB] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!topic.trim()) {
      toast.error("Please enter a debate topic");
      return;
    }

    if (topic.length < 10) {
      toast.error("Topic must be at least 10 characters long");
      return;
    }

    try {
      await onSubmit({
        topic: topic.trim(),
        personaA,
        personaB,
        rounds,
        autoJudge,
      });
    } catch (error) {
      toast.error("Failed to create debate");
    }
  };

  const renderPersonaSelector = (
    persona: Persona,
    setPersona: (persona: Persona) => void,
    isCustom: boolean,
    setCustom: (custom: boolean) => void,
    label: string
  ) => (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      {!isCustom ? (
        <div className="space-y-2">
          <select
            value={
              Object.keys(PRESET_PERSONAS).find(
                (key) => PRESET_PERSONAS[key].name === persona.name
              ) || ""
            }
            onChange={(e) => {
              if (e.target.value && PRESET_PERSONAS[e.target.value]) {
                setPersona(PRESET_PERSONAS[e.target.value]);
              }
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          >
            {Object.entries(PRESET_PERSONAS).map(([key, presetPersona]) => (
              <option key={key} value={key}>
                {presetPersona.name}
              </option>
            ))}
          </select>

          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-md text-xs text-slate-600 dark:text-slate-400">
            <p>
              <strong>Style:</strong> {persona.style}
            </p>
            <p className="mt-1">
              <strong>Bio:</strong> {persona.bio}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCustom(true)}
            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            Create custom persona
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Persona name"
            value={persona.name}
            onChange={(e) => setPersona({ ...persona, name: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />

          <textarea
            placeholder="Bio and background"
            value={persona.bio}
            onChange={(e) => setPersona({ ...persona, bio: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none"
          />

          <textarea
            placeholder="Speaking style and personality"
            value={persona.style}
            onChange={(e) => setPersona({ ...persona, style: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none"
          />

          <select
            value={persona.voice}
            onChange={(e) => setPersona({ ...persona, voice: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          >
            <option value="alloy">Alloy (Friendly)</option>
            <option value="echo">Echo (Authoritative)</option>
            <option value="fable">Fable (Storyteller)</option>
            <option value="onyx">Onyx (Deep)</option>
            <option value="nova">Nova (Energetic)</option>
            <option value="shimmer">Shimmer (Calm)</option>
          </select>

          <button
            type="button"
            onClick={() => setCustom(false)}
            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            Use preset persona
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-slate-800 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-center mb-6 text-slate-900 dark:text-white">
        Create AI Debate
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Topic Input */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Debate Topic
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What should these AI personas debate about? (e.g., 'Should social media be regulated like traditional media?')"
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none"
            maxLength={500}
          />
          <div className="text-xs text-slate-500 mt-1">
            {topic.length}/500 characters
          </div>
        </div>

        {/* Personas */}
        <div className="grid md:grid-cols-2 gap-6">
          {renderPersonaSelector(
            personaA,
            setPersonaA,
            customPersonaA,
            setCustomPersonaA,
            "Persona A"
          )}

          {renderPersonaSelector(
            personaB,
            setPersonaB,
            customPersonaB,
            setCustomPersonaB,
            "Persona B"
          )}
        </div>

        {/* Settings */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Number of Rounds
            </label>
            <select
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            >
              <option value={1}>1 Round</option>
              <option value={2}>2 Rounds</option>
              <option value={3}>3 Rounds</option>
              <option value={4}>4 Rounds</option>
              <option value={5}>5 Rounds</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Judging
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={autoJudge}
                  onChange={() => setAutoJudge(true)}
                  className="mr-2"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  AI Judge (Automatic)
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={!autoJudge}
                  onChange={() => setAutoJudge(false)}
                  className="mr-2"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Manual Judging
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !topic.trim()}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Creating Debate...
            </span>
          ) : (
            "Start Debate"
          )}
        </button>
      </form>
    </div>
  );
}
