import { useEffect, useState } from 'react';
import { Sword, Shield } from 'lucide-react';

interface OvertakeDefenseProps {
  addAlert: (message: string, type: string) => void;
}

export default function OvertakeDefense({ addAlert }: OvertakeDefenseProps) {
  const [offenseAnalysis, setOffenseAnalysis] = useState('Target slower in Sector 3');
  const [offensePrediction, setOffensePrediction] = useState(68);
  const [defenseThreat, setDefenseThreat] = useState('MEDIUM');

  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate changing battle conditions
      const scenarios = [
        'Target slower in Sector 3',
        'Catching 0.2s per lap',
        'DRS available next lap',
        'Tire advantage: 3 laps fresher',
        'Target struggling with traffic'
      ];
      
      setOffenseAnalysis(scenarios[Math.floor(Math.random() * scenarios.length)]);
      
      const newPrediction = Math.floor(Math.random() * 40) + 40;
      setOffensePrediction(newPrediction);
      
      const threats = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const newThreat = threats[Math.floor(Math.random() * threats.length)];
      setDefenseThreat(newThreat);

      if (newThreat === 'CRITICAL') {
        addAlert('Overtake/Defense: CRITICAL THREAT from behind!', 'battle');
      } else if (newPrediction >= 75) {
        addAlert('Overtake/Defense: High probability overtake opportunity', 'battle');
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [addAlert]);

  const getPredictionColor = () => {
    if (offensePrediction >= 75) return '#a3e635';
    if (offensePrediction >= 50) return '#06b6d4';
    return '#fbbf24';
  };

  const getThreatColor = () => {
    if (defenseThreat === 'CRITICAL') return '#f87171';
    if (defenseThreat === 'HIGH') return '#fbbf24';
    if (defenseThreat === 'MEDIUM') return '#06b6d4';
    return '#a3e635';
  };

  return (
    <div className="glass-card p-6 hover-glow-effect grain-overlay animate-fade-in">
      <h3 className="text-xl mb-4 text-[#06b6d4] text-glow-cyan uppercase tracking-wider">
        Battle Strategy
      </h3>
      
      <div className="space-y-4">
        {/* Offense Analysis */}
        <div className="bg-black/40 rounded-lg p-4 border border-[#a3e635]/30">
          <div className="flex items-center gap-2 mb-2">
            <Sword className="w-4 h-4 text-[#a3e635]" style={{ filter: 'drop-shadow(0 0 5px rgba(163, 230, 53, 0.5))' }} />
            <div className="text-xs text-[#a3a3a3] uppercase tracking-wider">Offense Analysis</div>
          </div>
          <div id="offenseAnalysis" className="text-white mb-3">
            {offenseAnalysis}
          </div>
          
          <div id="offensePrediction" className="bg-black/60 rounded-lg p-3 border border-white/10">
            <div className="text-xs text-[#a3a3a3] mb-2 uppercase tracking-wider">Overtake Probability</div>
            <div className="flex items-center gap-3">
              <div 
                className="text-2xl"
                style={{ 
                  color: getPredictionColor(),
                  filter: `drop-shadow(0 0 10px ${getPredictionColor()})`
                }}
              >
                {offensePrediction}%
              </div>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${offensePrediction}%`,
                    backgroundColor: getPredictionColor(),
                    boxShadow: `0 0 10px ${getPredictionColor()}`
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Defense Threat */}
        <div className="bg-black/40 rounded-lg p-4 border border-[#d946ef]/30">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-[#d946ef]" style={{ filter: 'drop-shadow(0 0 5px rgba(217, 70, 239, 0.5))' }} />
            <div className="text-xs text-[#a3a3a3] uppercase tracking-wider">Defense Status</div>
          </div>
          
          <div 
            id="defenseThreat" 
            className="text-center py-4 rounded-lg border-2 transition-all duration-300"
            style={{ 
              borderColor: getThreatColor(),
              backgroundColor: `${getThreatColor()}20`,
              color: getThreatColor(),
              filter: `drop-shadow(0 0 15px ${getThreatColor()})`
            }}
          >
            <div className="text-2xl">
              {defenseThreat}
            </div>
            <div className="text-xs mt-1 opacity-70">THREAT LEVEL</div>
          </div>
        </div>
      </div>
    </div>
  );
}
