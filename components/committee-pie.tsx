"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { CommitteeAllocation } from "@/lib/calc/portfolio";

export function CommitteePie({ data }: { data: CommitteeAllocation[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-gray-400">
        No positions yet
      </div>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={40}
            outerRadius={80}
            paddingAngle={1}
          >
            {data.map((d) => (
              <Cell key={d.id} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, _name, entry) => [
              `$${value.toLocaleString()} (${(((entry.payload as CommitteeAllocation).pct) * 100).toFixed(1)}%)`,
              (entry.payload as CommitteeAllocation).name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
