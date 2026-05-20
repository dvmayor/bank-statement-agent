"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

// Teal-leaning palette matching the page accent
const COLORS = ["#64ffda", "#5eead4", "#7dd3fc", "#a78bfa", "#fda4af", "#fcd34d"];

export default function SpendChart({ categories }: { categories: any[] }) {
  if (!categories.length) return null;
  return (
    <div className="bg-navy-light border border-navy-lighter rounded p-5">
      <h4 className="text-slate-lightest font-semibold mb-1">Spend by category</h4>
      <p className="mono-accent text-xxs mb-4">top {categories.length} categories</p>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={categories}
              dataKey="total"
              nameKey="category"
              outerRadius={70}
              stroke="#0a192f"
              strokeWidth={2}
            >
              {categories.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#0a192f",
                border: "1px solid #233554",
                borderRadius: 4,
                fontFamily: "var(--font-jetbrains)",
                fontSize: 12,
              }}
              itemStyle={{ color: "#ccd6f6" }}
              formatter={(v: number) => v.toFixed(2)}
            />
            <Legend
              wrapperStyle={{ fontFamily: "var(--font-inter)", fontSize: 12, color: "#8892b0" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
