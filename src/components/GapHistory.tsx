import { useEffect, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';

export default function GapHistory() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gapData] = useState(() => {
    const laps = 10;
    const gapAhead = [];
    const gapBehind = [];
    
    let currentAhead = 2.5;
    let currentBehind = 1.8;
    
    for (let i = 0; i < laps; i++) {
      currentAhead += (Math.random() - 0.5) * 0.4;
      currentBehind += (Math.random() - 0.5) * 0.3;
      
      gapAhead.push(Math.max(0.5, Math.min(5, currentAhead)));
      gapBehind.push(Math.max(0.3, Math.min(4, currentBehind)));
    }
    
    return { gapAhead, gapBehind };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    // Horizontal lines
    for (let i = 0; i <= 5; i++) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Vertical lines (lap markers)
    for (let i = 0; i <= 10; i++) {
      const x = (width / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw gap ahead line
    const drawGapLine = (data: number[], color: string, label: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();

      const maxGap = 5;
      const pointSpacing = width / (data.length - 1);

      data.forEach((gap, i) => {
        const x = i * pointSpacing;
        const normalized = gap / maxGap;
        const y = height - (normalized * (height - 40)) - 20;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();

      // Add glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw points
      data.forEach((gap, i) => {
        const x = i * pointSpacing;
        const normalized = gap / maxGap;
        const y = height - (normalized * (height - 40)) - 20;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw label
      ctx.fillStyle = color;
      ctx.font = '12px Inter';
      ctx.fillText(label, 10, label === 'GAP AHEAD' ? 20 : 40);
    };

    drawGapLine(gapData.gapAhead, '#06b6d4', 'GAP AHEAD');
    drawGapLine(gapData.gapBehind, '#d946ef', 'GAP BEHIND');

    // Draw lap labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px Inter';
    for (let i = 0; i <= 10; i++) {
      const x = (width / 10) * i;
      ctx.fillText(`L${i + 1}`, x - 8, height - 5);
    }
  }, [gapData]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        canvasRef.current.width = rect.width;
        canvasRef.current.height = rect.height;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="glass-card p-6 hover-glow-effect grain-overlay animate-fade-in" style={{ animationDelay: '0.4s' }}>
      <h3 className="text-xl mb-4 text-[#d946ef] text-glow-magenta uppercase tracking-wider flex items-center gap-2">
        <TrendingUp className="w-5 h-5" style={{ filter: 'drop-shadow(0 0 10px rgba(217, 70, 239, 0.6))' }} />
        Gap History (Last 10 Laps)
      </h3>
      
      <div id="gapHistoryChart" className="gap-chart-container">
        <canvas
          ref={canvasRef}
          className="w-full h-48 rounded-lg bg-black/40"
        />
      </div>
    </div>
  );
}
