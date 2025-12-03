import { Coins } from 'lucide-react';

interface ChipDisplayProps {
  balance: number;
  size?: 'sm' | 'md' | 'lg';
}

const ChipDisplay = ({ balance, size = 'md' }: ChipDisplayProps) => {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent to-accent/80 rounded-full shadow-lg">
      <Coins className={`${size === 'lg' ? 'w-8 h-8' : size === 'md' ? 'w-6 h-6' : 'w-5 h-5'} text-accent-foreground`} />
      <span className={`${sizeClasses[size]} font-bold text-accent-foreground`}>
        {balance.toLocaleString()}
      </span>
    </div>
  );
};

export default ChipDisplay;
