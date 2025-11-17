export default function DecorativeShapes() {
  return (
    <>
      {/* Hexagon 1 */}
      <svg
        className="fixed top-[10%] left-[15%] opacity-[0.08] animate-float pointer-events-none z-0"
        width="120"
        height="140"
        viewBox="0 0 120 140"
      >
        <defs>
          <linearGradient id="hex1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#a3e635" />
          </linearGradient>
        </defs>
        <polygon
          points="60,10 110,40 110,100 60,130 10,100 10,40"
          fill="none"
          stroke="url(#hex1)"
          strokeWidth="2"
        />
      </svg>

      {/* Circle Rings */}
      <svg
        className="fixed top-[60%] right-[10%] opacity-[0.06] animate-float-slower pointer-events-none z-0"
        width="200"
        height="200"
        viewBox="0 0 200 200"
      >
        <defs>
          <linearGradient id="circle1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="95" fill="none" stroke="url(#circle1)" strokeWidth="2" />
        <circle cx="100" cy="100" r="70" fill="none" stroke="url(#circle1)" strokeWidth="1.5" opacity="0.5" />
      </svg>

      {/* Triangle */}
      <svg
        className="fixed bottom-[20%] left-[5%] opacity-[0.07] animate-float-slow pointer-events-none z-0"
        width="150"
        height="150"
        viewBox="0 0 150 150"
      >
        <defs>
          <linearGradient id="tri1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a3e635" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
        </defs>
        <polygon
          points="75,10 140,130 10,130"
          fill="none"
          stroke="url(#tri1)"
          strokeWidth="2"
        />
      </svg>

      {/* Small Hexagon */}
      <svg
        className="fixed top-[40%] right-[25%] opacity-[0.05] animate-float pointer-events-none z-0"
        width="80"
        height="90"
        viewBox="0 0 80 90"
      >
        <polygon
          points="40,5 70,25 70,65 40,85 10,65 10,25"
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1.5"
        />
      </svg>

      {/* Dashed Lines */}
      <svg
        className="fixed top-[30%] left-[8%] opacity-[0.04] animate-pulse-slow pointer-events-none z-0"
        width="300"
        height="2"
      >
        <line x1="0" y1="1" x2="300" y2="1" stroke="#a3e635" strokeWidth="2" strokeDasharray="5,5" />
      </svg>
      
      <svg
        className="fixed top-[15%] right-[15%] opacity-[0.04] animate-pulse-slow pointer-events-none z-0"
        width="2"
        height="200"
      >
        <line x1="1" y1="0" x2="1" y2="200" stroke="#d946ef" strokeWidth="2" strokeDasharray="5,5" />
      </svg>
    </>
  );
}
