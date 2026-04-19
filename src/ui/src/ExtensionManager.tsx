import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Badge } from "@radix-ui/themes";
import { Download, CheckCircle, HardDrive } from "lucide-react";

interface Extension {
  id: string;
  name: string;
  description: string;
  size_mb: number;
  is_installed: boolean;
}

export function ExtensionManager() {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadExts() {
      try {
        const exts: Extension[] = await invoke("get_extensions");
        setExtensions(exts);
      } catch (err) {
        console.error("Failed to load extensions", err);
      } finally {
        setLoading(false);
      }
    }
    loadExts();
  }, []);

  const handleInstall = (id: string) => {
    setExtensions(prev => prev.map(ext => ext.id === id ? { ...ext, is_installed: true } : ext));
  };

  if (loading) return <div className="p-8 text-gray-400">Loading extensions...</div>;

  return (
    <div className="w-full h-full bg-gray-950 p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <HardDrive size={24} className="text-blue-400" />
            AI Extension Store
          </h2>
          <p className="text-gray-400 mt-2">Manage local LLMs and acceleration bridges for secure, offline analysis.</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {extensions.map(ext => (
            <div key={ext.id} className="bg-gray-900 border border-gray-800 rounded-lg p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-semibold text-gray-200">{ext.name}</h3>
                  {ext.is_installed && <Badge color="green">Installed</Badge>}
                </div>
                <p className="text-sm text-gray-400">{ext.description}</p>
                <div className="text-xs text-gray-500 mt-2 font-mono">{ext.size_mb} MB</div>
              </div>
              
              <div>
                {ext.is_installed ? (
                  <Button variant="soft" color="gray" disabled>
                    <CheckCircle size={16} /> Installed
                  </Button>
                ) : (
                  <Button variant="solid" color="blue" onClick={() => handleInstall(ext.id)}>
                    <Download size={16} /> Download
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
