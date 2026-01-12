"use client";

import { Star } from "lucide-react";

const testimonials = [
  {
    text: "This platform has transformed how I think about arguments. The AI judge gives incredibly insightful feedback.",
    author: "Sarah M.",
    role: "Law Student",
    initials: "SM",
  },
  {
    text: "Debating with friends has never been easier. The real-time features make it feel like we're in the same room.",
    author: "James D.",
    role: "Philosophy Major",
    initials: "JD",
  },
  {
    text: "The best tool for improving critical thinking. I use it weekly to practice and refine my argumentation skills.",
    author: "Rachel K.",
    role: "Debate Coach",
    initials: "RK",
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Loved by Debaters Worldwide
          </h2>
          <p className="text-lg text-muted-foreground">
            Join thousands of users sharpening their argumentation skills
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div key={index} className="p-6 bg-card rounded-xl border border-border">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 fill-yellow-400 text-yellow-400"
                  />
                ))}
              </div>
              <p className="text-muted-foreground mb-4">{testimonial.text}</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-primary font-semibold">
                    {testimonial.initials}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    {testimonial.author}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {testimonial.role}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

