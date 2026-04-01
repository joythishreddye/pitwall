import { BookOpen, HelpCircle, Award } from "lucide-react";

const MODULES = [
  {
    icon: BookOpen,
    title: "Race Weekend Format",
    description: "Practice, qualifying, sprint, and race sessions explained.",
    lessons: 5,
  },
  {
    icon: BookOpen,
    title: "Tyre Strategy",
    description: "Compounds, degradation curves, undercuts, and overcuts.",
    lessons: 4,
  },
  {
    icon: BookOpen,
    title: "Aerodynamics",
    description: "Downforce, drag, DRS, and dirty air in overtaking.",
    lessons: 6,
  },
  {
    icon: BookOpen,
    title: "Regulations",
    description: "Budget cap, power units, penalties, and sporting rules.",
    lessons: 7,
  },
  {
    icon: HelpCircle,
    title: "Quizzes",
    description: "Test your F1 knowledge with adaptive difficulty quizzes.",
    lessons: 0,
  },
  {
    icon: Award,
    title: "Achievements",
    description: "Earn badges as you learn — track your progress.",
    lessons: 0,
  },
] as const;

export default function AcademyPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            F1 Academy
          </h1>
          <span className="text-[10px] font-mono uppercase tracking-wider text-f1-yellow bg-f1-yellow/10 px-2 py-0.5 rounded-sm">
            Phase 4
          </span>
        </div>
        <p className="text-f1-muted text-sm mt-1">
          Learn Formula 1 from the ground up — interactive modules, quizzes, and gamification
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
        {MODULES.map(({ icon: Icon, title, description, lessons }) => (
          <div
            key={title}
            className="border border-f1-grid bg-f1-dark-2 p-5 rounded-sm group hover:border-f1-cyan/30 transition-colors duration-150"
          >
            <div className="flex items-center justify-between mb-3">
              <Icon className="h-5 w-5 text-f1-muted group-hover:text-f1-cyan transition-colors duration-150" />
              {lessons > 0 && (
                <span className="text-[10px] font-mono text-f1-muted">
                  {lessons} lessons
                </span>
              )}
            </div>
            <h3 className="font-semibold text-sm mb-1">{title}</h3>
            <p className="text-xs text-f1-muted leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
