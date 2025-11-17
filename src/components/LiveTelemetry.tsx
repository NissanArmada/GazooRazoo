import { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';

export default function LiveTelemetry() {
  const throttleCanvasRef = useRef<HTMLCanvasElement>(null);
  const brakeCanvasRef = useRef<HTMLCanvasElement>(null);
  const throttleDataRef = useRef<number[]>([]);
  const brakeDataRef = useRef<number[]>([]);

  useEffect(() => {
    const drawLiveChart = (
      canvas: HTMLCanvasElement,
      data: number[],
      color: string,
      label: string
    ) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Draw grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = (height / 5) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw data line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const pointSpacing = width / Math.max(data.length, 100);
      
      data.forEach((value, i) => {
        const x = i * pointSpacing;
        const y = height - (value * (height - 20)) - 10;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();

      // Draw glow effect
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw current value indicator
      if (data.length > 0) {
        const lastValue = data[data.length - 1];
        const y = height - (lastValue * (height - 20)) - 10;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(width - 5, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '12px Inter';
      ctx.fillText(label, 10, 20);
    };

    const animate = () => {
      // Simulate live data streaming
      const newThrottle = Math.max(0, Math.min(1, 
        Math.sin(Date.now() / 500) * 0.4 + 0.5 + (Math.random() - 0.5) * 0.1
      ));
      const newBrake = Math.max(0, Math.min(1,
        Math.cos(Date.now() / 700) * 0.3 + 0.3 + (Math.random() - 0.5) * 0.1
      ));

      throttleDataRef.current.push(newThrottle);
      brakeDataRef.current.push(newBrake);

      // Keep only last 100 points
      if (throttleDataRef.current.length > 100) {
        throttleDataRef.current.shift();
      }
      if (brakeDataRef.current.length > 100) {
        brakeDataRef.current.shift();
      }

      // Draw charts
      if (throttleCanvasRef.current) {
        drawLiveChart(
          throttleCanvasRef.current,
          throttleDataRef.current,
          '#a3e635',
          'THROTTLE (APS)'
        );
      }
      if (brakeCanvasRef.current) {
        drawLiveChart(
          brakeCanvasRef.current,
          brakeDataRef.current,
          '#06b6d4',
          'BRAKE PRESSURE (F)'
        );
      }
    };

    const interval = setInterval(animate, 50);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (throttleCanvasRef.current) {
        const rect = throttleCanvasRef.current.getBoundingClientRect();
        throttleCanvasRef.current.width = rect.width;
        throttleCanvasRef.current.height = rect.height;
      }
      if (brakeCanvasRef.current) {
        const rect = brakeCanvasRef.current.getBoundingClientRect();
        brakeCanvasRef.current.width = rect.width;
        brakeCanvasRef.current.height = rect.height;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      <div className="glass-card p-6 hover-glow-effect grain-overlay animate-fade-in">
        <h3 className="text-2xl mb-4 text-[#a3e635] text-glow-lime uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-6 h-6" style={{ filter: 'drop-shadow(0 0 10px rgba(163, 230, 53, 0.6))' }} />
          Live Telemetry
        </h3>
        
        <div id="liveThrottleChart" className="live-chart-container mb-4">
          <canvas
            ref={throttleCanvasRef}
            className="w-full h-32 rounded-lg bg-black/40"
          />
        </div>
      </div>

      <div className="glass-card p-6 hover-glow-effect grain-overlay animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <div id="liveBrakeChart" className="live-chart-container">
          <canvas
            ref={brakeCanvasRef}
            className="w-full h-32 rounded-lg bg-black/40"
          />
        </div>
      </div>
    </>
  );
}
