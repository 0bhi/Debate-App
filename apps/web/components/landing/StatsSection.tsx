"use client";

const stats = [
  { value: "10K+", label: "Active Users" },
  { value: "50K+", label: "Debates Completed" },
  { value: "98%", label: "Satisfaction Rate" },
  { value: "24/7", label: "Available" },
];

export function StatsSection() {
  return (
    <section className="py-16 border-y border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((stat, index) => (
            <div key={index}>
              <div className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
                {stat.value}
              </div>
              <div className="text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

