import { useState, useEffect } from 'react';
import TopBar from './components/TopBar';
import DriverDNA from './components/DriverDNA';
import TrackGrip from './components/TrackGrip';
import LiveTelemetry from './components/LiveTelemetry';
import OvertakeDefense from './components/OvertakeDefense';
import AlertFeed from './components/AlertFeed';
import PositionRadar from './components/PositionRadar';
import GrainTexture from './components/GrainTexture';
import ParticleBackground from './components/ParticleBackground';
import DecorativeShapes from './components/DecorativeShapes';
import DataUpload from './components/DataUpload';

export default function App() {
  const [fcyActive, setFcyActive] = useState(false);
  const [alerts, setAlerts] = useState<Array<{ time: string; message: string; type: string }>>([]);
  
  // Data State
  const [telemetryData, setTelemetryData] = useState<any[]>([]);
  const [weatherData, setWeatherData] = useState<any[]>([]);
  const [lapsData, setLapsData] = useState<any[]>([]);
  const [sectionsData, setSectionsData] = useState<any[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [currentDriver, setCurrentDriver] = useState<string>('');

  const addAlert = (message: string, type: string) => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setAlerts(prev => [{ time, message, type }, ...prev].slice(0, 20));
  };

  const handleDataLoaded = (data: { telemetry: any[], weather: any[], laps: any[], sections?: any[], driverName?: string }) => {
    setTelemetryData(data.telemetry);
    setWeatherData(data.weather);
    setLapsData(data.laps);
    if (data.sections) setSectionsData(data.sections);
    if (data.driverName) setCurrentDriver(data.driverName);
    setIsDataLoaded(true);
    addAlert(`Session data loaded successfully for Car #${data.driverName || 'Unknown'}`, 'system');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#000000] via-[#0a0a0a] to-[#050505] text-white overflow-x-hidden">
      {/* Particle Background */}
      <ParticleBackground />
      
      {/* Grain Texture */}
      <GrainTexture />
      
      {/* Decorative Shapes */}
      <DecorativeShapes />
      
      {/* Gradient Orbs */}
      <div className="fixed top-0 left-0 w-[800px] h-[800px] rounded-full opacity-20 blur-[120px] bg-[radial-gradient(circle,rgba(6,182,212,0.4)_0%,transparent_70%)] animate-float-slow pointer-events-none z-0" />
      <div className="fixed bottom-0 right-0 w-[700px] h-[700px] rounded-full opacity-20 blur-[120px] bg-[radial-gradient(circle,rgba(217,70,239,0.4)_0%,transparent_70%)] animate-float-slower pointer-events-none z-0" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-15 blur-[120px] bg-[radial-gradient(circle,rgba(163,230,53,0.3)_0%,transparent_70%)] animate-float pointer-events-none z-0" />
      
      {/* Grid Pattern */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.05]" style={{
        backgroundImage: `
          linear-gradient(rgba(6, 182, 212, 0.6) 1px, transparent 1px),
          linear-gradient(90deg, rgba(6, 182, 212, 0.6) 1px, transparent 1px),
          linear-gradient(rgba(217, 70, 239, 0.4) 1px, transparent 1px),
          linear-gradient(90deg, rgba(217, 70, 239, 0.4) 1px, transparent 1px)
        `,
        backgroundSize: '100px 100px, 100px 100px, 50px 50px, 50px 50px',
        backgroundPosition: '0 0, 0 0, 25px 25px, 25px 25px'
      }} />

      {/* Scanlines */}
      <div className="fixed inset-0 pointer-events-none z-[60] opacity-[0.02]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 255, 255, 0.1) 2px, rgba(255, 255, 255, 0.1) 4px)'
      }} />
      
      <div className="fixed inset-0 pointer-events-none z-[55] opacity-[0.03] animate-scanline" style={{
        height: '200px',
        background: 'linear-gradient(180deg, transparent 0%, rgba(6, 182, 212, 0.3) 50%, transparent 100%)'
      }} />

      {/* Top Bar */}
      <TopBar fcyActive={fcyActive} driverName={currentDriver} />

      {/* Main Content */}
      <main className="relative z-10 pt-24 pb-12 px-6 max-w-[1800px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel - Diagnostics */}
          <aside className="lg:col-span-3 space-y-6">
            <DriverDNA 
              addAlert={addAlert} 
              telemetryData={telemetryData} 
              lapsData={lapsData}
              sectionsData={sectionsData}
              driverName={currentDriver}
            />
            <PositionRadar />
          </aside>

          {/* Center Panel - Live Data Hub */}
          <section className="lg:col-span-6 space-y-6">
            <LiveTelemetry telemetryData={telemetryData} />
            <TrackGrip addAlert={addAlert} telemetryData={telemetryData} weatherData={weatherData} />
          </section>

          {/* Right Panel - Actionable Intel */}
          <aside className="lg:col-span-3 space-y-6">
            <OvertakeDefense addAlert={addAlert} telemetryData={telemetryData} />
            <AlertFeed alerts={alerts} />
          </aside>
        </div>
      </main>

      {/* Data Upload Modal - Placed last to ensure top z-index stacking */}
      {!isDataLoaded && <DataUpload onDataLoaded={handleDataLoaded} />}
    </div>
  );
}