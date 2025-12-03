import React from "react";

interface LastDrawnBallProps {
  number: number | null;
  displayNumber?: number | null;
  className?: string;
  justDrew?: boolean;
}

export const LastDrawnBall = React.forwardRef<
  HTMLDivElement,
  LastDrawnBallProps
>(({ number, displayNumber = null, className, justDrew = false }, ref) => {
  const shown = displayNumber ?? number;
  if (shown == null) return null;

  return (
    <div className={`mt-4 flex items-center gap-2 ${className ?? ""}`}>
      <span className="text-sm text-slate-300">Last draw:</span>
      <div
        ref={ref}
        className={`w-12 h-12 rounded-full bg-yellow-400 flex items-center justify-center text-xl font-bold shadow-lg ${
          justDrew ? "just-draw" : ""
        }`}
      >
        {shown}
      </div>
    </div>
  );
});
LastDrawnBall.displayName = "LastDrawnBall";
