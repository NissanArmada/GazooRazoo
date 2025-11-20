import { useEffect, useRef, useState } from 'react';

interface DriverDNAProps {
  addAlert: (message: string, type: string) => void;
}

export default function DriverDNA({ addAlert }: DriverDNAProps) {
  const brakeCanvasRef = useRef<HTMLCanvasElement>(null);
  const throttleCanvasRef = useRef<HTMLCanvasElement>(null);
  const [dnaAlert, setDnaAlert] = useState('');

  useEffect(() => {
    const drawChart = (canvas: HTMLCanvasElement, color: string, type: 'brake' | 'throttle') => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const leftMargin = 40;
      const rightMargin = 10;
      const topMargin = 10;
      const bottomMargin = 10;
      const chartWidth = width - leftMargin - rightMargin;
      const chartHeight = height - topMargin - bottomMargin;

      ctx.clearRect(0, 0, width, height);

      // Draw grid and Y-axis labels
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px Inter';
      ctx.textAlign = 'right';
      
      for (let i = 0; i <= 4; i++) {
        const y = topMargin + (chartHeight / 4) * i;
        const value = 100 - (i * 25); // 100%, 75%, 50%, 25%, 0%
        
        // Draw grid line
        ctx.beginPath();
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(width - rightMargin, y);
        ctx.stroke();
        
        // Draw Y-axis tick
        ctx.beginPath();
        ctx.moveTo(leftMargin - 5, y);
        ctx.lineTo(leftMargin, y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        
        // Draw Y-axis label
        ctx.fillText(`${value}%`, leftMargin - 8, y + 3);
      }

      // Draw baseline "DNA" signature (optimal)
      ctx.strokeStyle = `${color}40`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      
      const baselinePoints = [];
      for (let i = 0; i < chartWidth; i += 2) {
        const progress = i / chartWidth;
        let value;
        
        if (type === 'brake') {
          // Sharp braking pattern
          value = progress < 0.3 ? 0 : progress < 0.4 ? (progress - 0.3) * 10 : progress < 0.7 ? 1 : (0.9 - progress) * 3.3;
        } else {
          // Smooth throttle application
          value = progress < 0.4 ? 0 : progress < 0.6 ? (progress - 0.4) * 5 : 1;
        }
        
        baselinePoints.push(value);
        const x = leftMargin + i;
        const y = topMargin + chartHeight - value * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw current trace with slight deviation
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      for (let i = 0; i < chartWidth; i += 2) {
        const deviation = (Math.random() - 0.5) * 0.15;
        const value = Math.max(0, Math.min(1, baselinePoints[i / 2] + deviation));
        const x = leftMargin + i;
        const y = topMargin + chartHeight - value * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const animate = () => {
      if (brakeCanvasRef.current) {
        drawChart(brakeCanvasRef.current, '#06b6d4', 'brake');
      }
      if (throttleCanvasRef.current) {
        drawChart(throttleCanvasRef.current, '#a3e635', 'throttle');
      }
    };

    const interval = setInterval(() => {
      animate();
      
      // Random fatigue detection
      if (Math.random() < 0.02) {
        setDnaAlert('FATIGUE DETECTED - BRAKING INCONSISTENCY');
        addAlert('Driver DNA: Fatigue detected - braking pattern deviation', 'dna');
        setTimeout(() => setDnaAlert(''), 5000);
      }
    }, 2000);

    // Initial draw
    animate();

    return () => clearInterval(interval);
  }, [addAlert]);

  useEffect(() => {
    const handleResize = () => {
      if (brakeCanvasRef.current) {
        const rect = brakeCanvasRef.current.getBoundingClientRect();
        brakeCanvasRef.current.width = rect.width;
        brakeCanvasRef.current.height = rect.height;
      }
      if (throttleCanvasRef.current) {
        const rect = throttleCanvasRef.current.getBoundingClientRect();
        throttleCanvasRef.current.width = rect.width;
        throttleCanvasRef.current.height = rect.height;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="glass-card p-6 hover-glow-effect grain-overlay animate-fade-in">
      <h3 className="text-xl mb-4 text-[#d946ef] text-glow-magenta uppercase tracking-wider">
        Driver DNA
      </h3>
      
      <div className="space-y-4">
        {/* Brake Chart */}
        <div className="dna-chart-container">
          <div className="text-xs text-[#a3a3a3] mb-2 uppercase tracking-wider">Brake Pressure</div>
          <canvas
            ref={brakeCanvasRef}
            className="w-full h-24 rounded-lg bg-black/40"
          />
        </div>

        {/* Throttle Chart */}
        <div className="dna-chart-container">
          <div className="text-xs text-[#a3a3a3] mb-2 uppercase tracking-wider">Throttle Application</div>
          <canvas
            ref={throttleCanvasRef}
            className="w-full h-24 rounded-lg bg-black/40"
          />
        </div>

        {/* Alert Box */}
        {dnaAlert && (
          <div id="dnaAlertBox" className="p-3 rounded-lg bg-[#f87171]/20 border border-[#f87171]/50 text-[#f87171] text-sm animate-pulse">
            {dnaAlert}
          </div>
        )}
      </div>
    </div>
  );
}
