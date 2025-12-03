import React from "react";

interface SpinningMachineProps {
  ballCount?: number;
  maxNumber?: number; // used for labels, if ballCount < maxNumber
  sizeClass?: string; // optional tailwind size class override
  displayNumber?: number | null;
}

export const SpinningMachine = React.forwardRef<
  HTMLDivElement,
  SpinningMachineProps
>(
  (
    {
      ballCount = 40,
      maxNumber = 90,
      sizeClass = "w-72 h-96",
      displayNumber = null,
    },
    ref
  ) => {
    const BALL_COUNT = Math.max(1, Math.min(120, ballCount));

    const balls = Array.from({ length: BALL_COUNT }, (_, i) => {
      const label = (i % maxNumber) + 1;
      return { n: label, i };
    });

    return (
      <div
        ref={ref}
        className={`flex flex-col items-center ${sizeClass} relative select-none`}
      >
        {/* digital screen: rounded rectangle that holds the balls */}
        <div
          className="relative w-full h-64 bg-[#041f0e] border border-[#183325] rounded-xl overflow-hidden shadow-inner flex flex-col items-center justify-between p-3"
          data-digital-screen
        >
          {/* Top heading */}
          <div className="w-full flex items-center justify-center">
            <div className="text-xs text-slate-300 uppercase tracking-wider">
              Live Draw
            </div>
          </div>

          {/* main digital ball region */}
          <div className="relative w-full flex-1 flex items-center justify-center">
            <div className="w-11/12 h-4/5 rounded-md bg-gradient-to-br from-[#02130b] to-[#032a12] border border-[#0b2a12] p-3 grid items-center justify-center tv-grid">
              {balls.map(({ n, i }) => {
                const colorClass =
                  i % 4 === 0
                    ? "ball-gold"
                    : i % 3 === 0
                    ? "ball-blue"
                    : i % 2 === 0
                    ? "ball-green"
                    : "ball-red";
                return (
                  <div
                    key={i}
                    data-ball-number={n}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-md ball-jitter tv-grid-ball ${colorClass}`}
                    aria-hidden
                  >
                    {n}
                  </div>
                );
              })}
            </div>
          </div>

          {/* digital tv screen footer */}
          <div className="w-full flex items-center justify-between text-xs text-slate-400">
            <div className="pl-2">Numbers: 1–{maxNumber}</div>
            <div className="pr-2">
              <div className="digital-tv inline-flex items-center px-2 py-1 rounded-md bg-[#07160c] border border-[#163522] shadow-md">
                <div className="tv-screen flex items-center justify-center w-12 h-8 bg-[#001b09] rounded-sm mr-2 p-1">
                  <div
                    className={`tv-ball ${
                      displayNumber != null ? "on" : "off"
                    }`}
                  >
                    {displayNumber != null ? displayNumber : "--"}
                  </div>
                </div>
                <div className="text-xs text-slate-300 tracking-wide ml-1 uppercase">
                  Live
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
SpinningMachine.displayName = "SpinningMachine";
