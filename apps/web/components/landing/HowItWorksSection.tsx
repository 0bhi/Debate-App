"use client";

const steps = [
  {
    number: 1,
    title: "Create or Join",
    description:
      "Sign up for free and create a debate room on any topic, or accept an invitation from a friend.",
    gradient: "from-primary to-purple-500",
  },
  {
    number: 2,
    title: "Debate in Real-Time",
    description:
      "Take turns presenting your arguments. Watch the conversation unfold in real-time with instant messaging.",
    gradient: "from-purple-500 to-accent",
  },
  {
    number: 3,
    title: "Get Feedback",
    description:
      "Receive AI-powered analysis of your arguments. Learn what worked, what didn't, and how to improve.",
    gradient: "from-accent to-primary",
  },
];

export function HowItWorksSection() {
  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            How It Works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start debating in minutes with our simple three-step process
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map((step) => (
            <div key={step.number} className="text-center">
              <div
                className={`w-16 h-16 bg-gradient-to-br ${step.gradient} rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-white shadow-lg`}
              >
                {step.number}
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {step.title}
              </h3>
              <p className="text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

