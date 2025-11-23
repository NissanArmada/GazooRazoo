import { useEffect, useState, useRef } from 'react';
import { TrendingUp } from 'lucide-react';

interface Car {
  id: number;
  angle: number;
  distance: number;
  isPlayer: boolean;
  color: string;
  label: string;
}

export default function PositionRadar() {
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Car positions for radar
  const [cars, setCars] = useState<Car[]>([
    { id: 1, angle: 0, distance: 0, isPlayer: true, color: '#a3e635', label: 'YOU' },
    { id: 2, angle: 350, distance: 0.4, isPlayer: false, color: '#06b6d4', label: 'P3' },
    { id: 3, angle: 10, distance: 0.6, isPlayer: false, color: '#d946ef', label: 'P5' },
    { id: 4, angle: 180, distance: 0.3, isPlayer: false, color: '#fbbf24', label: 'P6' },
    { id: 5, angle: 270, distance: 0.5, isPlayer: false, color: '#f87171', label: 'P8' },
  ]);

  // Update car positions
  useEffect(() => {
    const interval = setInterval(() => {
      setCars(prev => prev.map(car => {
        if (car.isPlayer) return car;
        
        return {
          ...car,
          angle: (car.angle + (Math.random() - 0.5) * 15 + 360) % 360,
          distance: Math.max(0.2, Math.min(0.9, car.distance + (Math.random() - 0.5) * 0.1))
        };
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Draw radar
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Guard against invalid canvas dimensions
    if (width <= 0 || height <= 0) return;
    
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - 10;
    
    // Guard against negative radius
    if (maxRadius <= 0) return;

    ctx.clearRect(0, 0, width, height);

    // Draw radar circles
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (maxRadius / 3) * i, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw radar cross
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - maxRadius);
    ctx.lineTo(centerX, centerY + maxRadius);
    ctx.moveTo(centerX - maxRadius, centerY);
    ctx.lineTo(centerX + maxRadius, centerY);
    ctx.stroke();

    // Draw scanning line (rotating)
    const scanAngle = (Date.now() / 30) % 360;
    const scanRad = (scanAngle * Math.PI) / 180;
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(scanRad - Math.PI / 2) * maxRadius,
      centerY + Math.sin(scanRad - Math.PI / 2) * maxRadius
    );
    ctx.stroke();

    // Draw gradient fade for scan line
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.1)');
    gradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.05)');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, maxRadius, scanRad - Math.PI / 2 - 0.3, scanRad - Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    // Draw cars
    cars.forEach(car => {
      const carRad = (car.angle * Math.PI) / 180;
      const carDist = car.distance * maxRadius;
      const carX = centerX + Math.cos(carRad - Math.PI / 2) * carDist;
      const carY = centerY + Math.sin(carRad - Math.PI / 2) * carDist;

      // Draw car dot
      ctx.fillStyle = car.color;
      ctx.shadowColor = car.color;
      ctx.shadowBlur = car.isPlayer ? 15 : 10;
      ctx.beginPath();
      ctx.arc(carX, carY, car.isPlayer ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw label
      ctx.fillStyle = car.color;
      ctx.font = 'bold 9px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(car.label, carX, carY - 10);
    });

    // Draw center dot
    ctx.fillStyle = '#a3e635';
    ctx.shadowColor = '#a3e635';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw compass labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('N', centerX, centerY - maxRadius - 5);
    ctx.fillText('S', centerX, centerY + maxRadius + 12);
    ctx.textAlign = 'left';
    ctx.fillText('E', centerX + maxRadius + 5, centerY + 4);
    ctx.textAlign = 'right';
    ctx.fillText('W', centerX - maxRadius - 5, centerY + 4);

    const animationFrame = requestAnimationFrame(() => {});
    return () => cancelAnimationFrame(animationFrame);
  });

  useEffect(() => {
    const handleResize = () => {
      if (radarCanvasRef.current) {
        const rect = radarCanvasRef.current.getBoundingClientRect();
        radarCanvasRef.current.width = rect.width;
        radarCanvasRef.current.height = rect.height;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="glass-card p-4 hover-glow-effect grain-overlay animate-fade-in" style={{ animationDelay: '0.3s' }}>
      <div className="text-xs text-[#06b6d4] mb-2 uppercase tracking-wider flex items-center gap-1">
        <TrendingUp className="w-3 h-3" />
        Position Radar
      </div>
      <canvas
        ref={radarCanvasRef}
        className="w-full aspect-square rounded-lg bg-black/60"
      />
    </div>
  );
}
