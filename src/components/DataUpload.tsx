import React, { useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';

interface DataUploadProps {
  onDataLoaded: (data: {
    telemetry: any[];
    weather: any[];
    laps: any[];
    sections?: any[];
    driverName?: string;
  }) => void;
}

export default function DataUpload({ onDataLoaded }: DataUploadProps) {
  const [telemetryFile, setTelemetryFile] = useState<File | null>(null);
  const [weatherFile, setWeatherFile] = useState<File | null>(null);
  const [lapsFile, setLapsFile] = useState<File | null>(null);
  const [sectionsFile, setSectionsFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  
  // Multi-driver support
  const [parsedDrivers, setParsedDrivers] = useState<string[] | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'telemetry' | 'weather' | 'laps' | 'sections') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (type === 'telemetry') {
        setTelemetryFile(file);
        setParsedDrivers(null); // Reset parsed drivers on new file
        setSelectedDriver(null);
      }
      if (type === 'weather') setWeatherFile(file);
      if (type === 'laps') setLapsFile(file);
      if (type === 'sections') setSectionsFile(file);
      setError('');
    }
  };

  // Helper to read a chunk as text
  const readChunk = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(reader.error);
      reader.readAsText(blob);
    });
  };

  // Scan the entire file to find unique drivers
  const scanTelemetryDrivers = async (file: File): Promise<string[]> => {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const drivers = new Set<string>();
    let offset = 0;
    let leftover = '';
    
    console.log(`[DataUpload] Scanning ${file.name} for drivers...`);
    
    while (offset < file.size) {
      // Update progress for scanning phase (0-50%)
      const scanProgress = Math.round((offset / file.size) * 50);
      setProgress(scanProgress);
      
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const text = await readChunk(chunk);
      
      const fullText = leftover + text;
      const lines = fullText.split(/\r\n|\n|\r/);
      
      // Save last line as leftover unless EOF
      if (offset + CHUNK_SIZE < file.size) {
        leftover = lines.pop() || '';
      } else {
        leftover = '';
      }
      
      // Process lines to find drivers
      // Header check on first chunk
      const startIndex = offset === 0 ? 1 : 0;
      
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        // Optimized: vehicle_number is the last column (index 12)
        // We can just look for the last comma
        const lastComma = line.lastIndexOf(',');
        if (lastComma !== -1) {
          const val = line.substring(lastComma + 1).trim();
          // Basic validation to avoid garbage
          if (val && val.length < 10 && !isNaN(parseFloat(val))) {
            drivers.add(val);
          }
        }
      }
      
      offset += CHUNK_SIZE;
    }
    
    const driverList = Array.from(drivers).sort((a, b) => parseInt(a) - parseInt(b));
    console.log(`[DataUpload] Scan complete. Found drivers: ${driverList.join(', ')}`);
    return driverList;
  };

  // Parse telemetry for a specific driver
  const parseTelemetryForDriver = async (file: File, driverId: string): Promise<any[]> => {
    const CHUNK_SIZE = 10 * 1024 * 1024;
    let offset = 0;
    let leftover = '';
    const result: any[] = [];
    
    console.log(`[DataUpload] Parsing telemetry for driver ${driverId}...`);
    
    while (offset < file.size) {
      // Update progress for parsing phase (50-90%)
      const parseProgress = 50 + Math.round((offset / file.size) * 40);
      setProgress(parseProgress);
      
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const text = await readChunk(chunk);
      
      const fullText = leftover + text;
      const lines = fullText.split(/\r\n|\n|\r/);
      
      if (offset + CHUNK_SIZE < file.size) {
        leftover = lines.pop() || '';
      } else {
        leftover = '';
      }
      
      const startIndex = offset === 0 ? 1 : 0;
      
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // We need to check if this line belongs to the selected driver
        // Check last column first for speed
        const lastComma = line.lastIndexOf(',');
        if (lastComma === -1) continue;
        
        const rowDriver = line.substring(lastComma + 1).trim();
        if (rowDriver !== driverId) continue;
        
        // If match, parse the full line
        const cols = line.split(',');
        if (cols.length < 11) continue;

        const name = cols[8];
        const value = parseFloat(cols[9]);
        const timestamp = cols[10];
        
        if (!timestamp) continue;
        
        // We need to aggregate by timestamp. 
        // Since we are streaming, we might encounter the same timestamp across chunks?
        // Unlikely if sorted by time. But if grouped by driver, yes.
        // However, we are filtering by driver, so we are effectively reading a contiguous block of time for that driver (if sorted by time)
        // OR scattered blocks (if sorted by time).
        // We can't easily use a Map for the WHOLE file if it's huge.
        // BUT, for a SINGLE driver, the data size is much smaller (1.4GB / 30 drivers ~= 46MB).
        // So we CAN store the result in memory.
        
        // To avoid Map overhead during parse, let's just push raw objects and aggregate later?
        // Or aggregate on the fly. Since we filter by driver, the dataset is manageable.
        
        // Let's use a simple object structure to save memory
        result.push({ t: timestamp, n: name, v: value });
      }
      
      offset += CHUNK_SIZE;
    }
    
    // Post-process: Aggregate by timestamp
    console.log(`[DataUpload] Aggregating ${result.length} raw points...`);
    const tempMap = new Map<string, any>();
    
    for (const p of result) {
      if (!tempMap.has(p.t)) {
        tempMap.set(p.t, { timestamp: new Date(p.t).getTime() });
      }
      const entry = tempMap.get(p.t);
      
      if (p.n === 'speed') entry.speed = p.v;
      else if (p.n === 'nmot') entry.rpm = p.v;
      else if (p.n === 'gear') entry.gear = p.v;
      else if (p.n === 'ath') entry.throttle = p.v / 100;
      else if (p.n === 'pbrake_f') entry.brake = p.v / 100;
      else if (p.n === 'Steering_Angle') entry.steering = p.v;
    }
    
    const sortedData = Array.from(tempMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    console.log(`[DataUpload] Final dataset: ${sortedData.length} points`);
    return sortedData;
  };

  const parseCSV = async (file: File, type: 'telemetry' | 'weather' | 'laps' | 'sections'): Promise<any> => {
    console.log(`[DataUpload] Starting parse for ${type} file: ${file.name} (${file.size} bytes)`);
    
    if (type === 'telemetry') {
      // For telemetry, we first scan for drivers
      return scanTelemetryDrivers(file);
    }

    // For other files, use simple parsing
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split(/\r\n|\n|\r/);
          const data: any[] = [];
          const startIndex = 1;
          const limit = lines.length; 

          if (type === 'weather') {
             for (let i = startIndex; i < limit; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              const cols = line.split(';');
              if (cols.length < 4) continue;
              data.push({
                timestamp: new Date(cols[1]).getTime(),
                airTemp: parseFloat(cols[2]),
                trackTemp: parseFloat(cols[3]),
                humidity: parseFloat(cols[4]),
                rain: parseFloat(cols[8])
              });
            }
            resolve(data);

          } else if (type === 'laps') {
            for (let i = startIndex; i < limit; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              const cols = line.split(',');
              if (cols.length < 9) continue;
              data.push({
                lap: parseInt(cols[1]),
                time: parseFloat(cols[8]),
                timestamp: new Date(cols[7]).getTime()
              });
            }
            resolve(data);
          } else if (type === 'sections') {
            // Parse sections file for FCY flags and sector times
            // Format: NUMBER; DRIVER_NUMBER; LAP_NUMBER; ... FLAG_AT_FL; ...
            for (let i = startIndex; i < limit; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              const cols = line.split(';');
              if (cols.length < 24) continue;
              
              // We need to map columns carefully based on the header
              // Assuming standard format from user's file
              data.push({
                number: parseInt(cols[0]),
                lap: parseInt(cols[2]),
                flag: cols[23], // FLAG_AT_FL
                s1: parseFloat(cols[24]), // S1_SECONDS
                s2: parseFloat(cols[25]), // S2_SECONDS
                s3: parseFloat(cols[26])  // S3_SECONDS
              });
            }
            resolve(data);
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  };

  const finishLoading = async (driverName: string) => {
    if (!telemetryFile) return;
    
    setLoading(true);
    
    try {
      // Now we parse the full telemetry for the selected driver
      const telemetryData = await parseTelemetryForDriver(telemetryFile, driverName);
      
      setProgress(95);
      const weatherData = weatherFile ? await parseCSV(weatherFile, 'weather') : [];
      const lapsData = lapsFile ? await parseCSV(lapsFile, 'laps') : [];
      const sectionsData = sectionsFile ? await parseCSV(sectionsFile, 'sections') : [];
      setProgress(100);

      onDataLoaded({
        telemetry: telemetryData,
        weather: weatherData,
        laps: lapsData,
        sections: sectionsData,
        driverName
      });
    } catch (err) {
      console.error('[DataUpload] Loading failed:', err);
      setError('Failed to load driver data.');
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!telemetryFile) {
      setError('Telemetry file is required');
      return;
    }

    console.log('[DataUpload] Starting processing...');
    setLoading(true);
    setProgress(0);

    try {
      // Step 1: Scan for drivers
      const drivers = await parseCSV(telemetryFile, 'telemetry');
      
      if (drivers.length === 0) {
        throw new Error('No valid driver data found');
      }
      
      if (drivers.length > 1) {
        console.log('[DataUpload] Multiple drivers found, prompting selection');
        // Store the list of drivers (strings) in the state
        // We reuse parsedDrivers state but now it stores string[] instead of Map
        setParsedDrivers(drivers); 
        setLoading(false);
        return;
      }
      
      // Single driver - proceed automatically
      finishLoading(drivers[0]);
      
    } catch (err) {
      console.error('[DataUpload] Processing failed:', err);
      setError('Failed to parse files. Please check the format.');
      setLoading(false);
    }
  };

  const handleDriverSelect = () => {
    if (selectedDriver) {
      finishLoading(selectedDriver);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ backgroundColor: '#000000', zIndex: 9999 }}>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="border border-white/10 rounded-xl p-8 max-w-md w-full shadow-2xl" style={{ backgroundColor: '#18181b' }}>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Initialize Race Data</h2>
            <p className="text-gray-400 text-sm">Upload session files to begin analysis</p>
          </div>

        {!parsedDrivers ? (
          <>
            <div className="space-y-4 mb-8">
              {/* Telemetry Input */}
              <div className={`p-4 rounded-lg border ${telemetryFile ? 'border-[#a3e635]/50 bg-[#a3e635]/10' : 'border-white/10 bg-white/5'} transition-colors`}>
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${telemetryFile ? 'bg-[#a3e635]/20 text-[#a3e635]' : 'bg-white/10 text-gray-400'}`}>
                      {telemetryFile ? <CheckCircle2 size={20} /> : <Upload size={20} />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Telemetry Data</div>
                      <div className="text-xs text-gray-500">{telemetryFile ? telemetryFile.name : 'Required (CSV)'}</div>
                    </div>
                  </div>
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange(e, 'telemetry')} />
                </label>
              </div>

              {/* Weather Input */}
              <div className={`p-4 rounded-lg border ${weatherFile ? 'border-[#06b6d4]/50 bg-[#06b6d4]/10' : 'border-white/10 bg-white/5'} transition-colors`}>
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${weatherFile ? 'bg-[#06b6d4]/20 text-[#06b6d4]' : 'bg-white/10 text-gray-400'}`}>
                      {weatherFile ? <CheckCircle2 size={20} /> : <Upload size={20} />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Weather Data</div>
                      <div className="text-xs text-gray-500">{weatherFile ? weatherFile.name : 'Optional (CSV)'}</div>
                    </div>
                  </div>
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange(e, 'weather')} />
                </label>
              </div>

              {/* Laps Input */}
              <div className={`p-4 rounded-lg border ${lapsFile ? 'border-[#d946ef]/50 bg-[#d946ef]/10' : 'border-white/10 bg-white/5'} transition-colors`}>
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${lapsFile ? 'bg-[#d946ef]/20 text-[#d946ef]' : 'bg-white/10 text-gray-400'}`}>
                      {lapsFile ? <CheckCircle2 size={20} /> : <Upload size={20} />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Lap Times</div>
                      <div className="text-xs text-gray-500">{lapsFile ? lapsFile.name : 'Optional (CSV)'}</div>
                    </div>
                  </div>
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange(e, 'laps')} />
                </label>
              </div>

              {/* Sections Input */}
              <div className={`p-4 rounded-lg border ${sectionsFile ? 'border-[#fbbf24]/50 bg-[#fbbf24]/10' : 'border-white/10 bg-white/5'} transition-colors`}>
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${sectionsFile ? 'bg-[#fbbf24]/20 text-[#fbbf24]' : 'bg-white/10 text-gray-400'}`}>
                      {sectionsFile ? <CheckCircle2 size={20} /> : <Upload size={20} />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Track Sections</div>
                      <div className="text-xs text-gray-500">{sectionsFile ? sectionsFile.name : 'Optional (CSV)'}</div>
                    </div>
                  </div>
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange(e, 'sections')} />
                </label>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-3 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              onClick={handleProcess}
              disabled={loading || !telemetryFile}
              className={`w-full py-3 rounded-lg font-medium transition-all ${
                loading || !telemetryFile
                  ? 'bg-white/10 text-gray-500 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-gray-200'
              }`}
            >
              {loading ? `Processing... ${progress}%` : 'Load Session Data'}
            </button>
          </>
        ) : (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-medium text-white mb-4">Select Driver</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                {parsedDrivers.map(driver => (
                  <button
                    key={driver}
                    onClick={() => setSelectedDriver(driver)}
                    className={`w-full p-3 rounded-lg text-left transition-all flex items-center justify-between ${
                      selectedDriver === driver
                        ? 'bg-[#a3e635] text-black font-bold'
                        : 'bg-black/40 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <span>Car #{driver}</span>
                    {selectedDriver === driver && <CheckCircle2 size={18} />}
                  </button>
                ))}
              </div>
            </div>
            
            <button
              onClick={handleDriverSelect}
              disabled={!selectedDriver}
              className={`w-full py-3 rounded-lg font-medium transition-all ${
                !selectedDriver
                  ? 'bg-white/10 text-gray-500 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-gray-200'
              }`}
            >
              Confirm Selection
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
