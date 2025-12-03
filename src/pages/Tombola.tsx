import React from "react";
import { Link } from "react-router-dom";

const Tombola: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#020f0b] flex items-center justify-center px-4">
      <div className="rounded-[32px] border border-[#183325] bg-[#03160f] px-8 py-10 md:px-12 md:py-12 text-slate-50 shadow-[0_24px_80px_rgba(0,0,0,0.75)] w-full max-w-3xl">
        <h1 className="text-center text-3xl md:text-4xl font-semibold text-[#facc15] font-['Playfair_Display',serif] flex items-center justify-center gap-3">
          🎁 Christmas Tombola
        </h1>

        <p className="text-center text-slate-200 mt-6">
          Tombola interface coming next ✨
        </p>

        <div className="mt-8 flex justify-center">
          <Link
            to="/"
            className="bg-[#e11d48] hover:bg-[#be123c] rounded-[32px] px-6 py-3 text-lg font-semibold"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Tombola;
