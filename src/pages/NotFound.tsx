import React from "react";
import { Link } from "react-router-dom";

const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#020f0b] flex items-center justify-center px-4">
      <div className="rounded-[32px] border border-[#183325] bg-[#03160f] px-8 py-10 md:px-12 md:py-12 text-slate-50 shadow-[0_24px_80px_rgba(0,0,0,0.75)] w-full max-w-3xl text-center">
        <h1 className="text-4xl md:text-5xl font-semibold text-[#facc15] font-['Playfair_Display',serif] mb-4">
          🎄 Oops! Santa lost this page.
        </h1>
        <p className="text-slate-200 mb-6">
          We couldn't find what you were looking for — but gifts are on the way
          🎁
        </p>
        <Link
          to="/"
          className="bg-[#e11d48] hover:bg-[#be123c] rounded-[32px] px-6 py-3 text-lg font-semibold"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
