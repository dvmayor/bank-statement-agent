"use client";
import { LucideIcon } from "lucide-react";

export default function SectionHeader({
  icon: Icon,
  label,
  title,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
}) {
  return (
    <div className="mb-6">
      <div className="section-eyebrow">
        <Icon size={18} />
        <span>{label}</span>
      </div>
      <h2 className="section-title">{title}</h2>
    </div>
  );
}
