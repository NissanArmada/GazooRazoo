import { AlertCircle, Activity, Cloud, Swords } from 'lucide-react';

interface Alert {
  time: string;
  message: string;
  type: string;
}

interface AlertFeedProps {
  alerts: Alert[];
}

export default function AlertFeed({ alerts }: AlertFeedProps) {
  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'fcy':
        return <AlertCircle className="w-4 h-4 text-[#fbbf24]" />;
      case 'dna':
        return <Activity className="w-4 h-4 text-[#d946ef]" />;
      case 'weather':
        return <Cloud className="w-4 h-4 text-[#06b6d4]" />;
      case 'battle':
        return <Swords className="w-4 h-4 text-[#a3e635]" />;
      default:
        return <AlertCircle className="w-4 h-4 text-white" />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'fcy':
        return 'border-[#fbbf24]/50 bg-[#fbbf24]/10';
      case 'dna':
        return 'border-[#d946ef]/50 bg-[#d946ef]/10';
      case 'weather':
        return 'border-[#06b6d4]/50 bg-[#06b6d4]/10';
      case 'battle':
        return 'border-[#a3e635]/50 bg-[#a3e635]/10';
      default:
        return 'border-white/30 bg-white/10';
    }
  };

  return (
    <div className="glass-card p-6 hover-glow-effect grain-overlay animate-fade-in" style={{ animationDelay: '0.2s' }}>
      <h3 className="text-xl mb-4 text-[#a3e635] text-glow-lime uppercase tracking-wider">
        Alert Feed
      </h3>
      
      <div id="alertFeed" className="space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-[#737373]">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div className="text-sm">No alerts</div>
          </div>
        ) : (
          alerts.map((alert, i) => (
            <div 
              key={i}
              className={`p-3 rounded-lg border ${getAlertColor(alert.type)} animate-fade-in`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {getAlertIcon(alert.type)}
                </div>
                <div className="flex-1">
                  <div className="text-xs text-[#a3a3a3] mb-1">{alert.time}</div>
                  <div className="text-sm text-white">{alert.message}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
