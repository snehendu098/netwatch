import * as si from 'systeminformation';
import { AgentService } from './agent-service';

interface ProcessInfo {
  processName: string;
  processId: number;
  path: string;
  cpuUsage: number;
  memoryUsage: number;
  username: string;
  startedAt?: number;
}

export class ProcessMonitor {
  private agentService: AgentService;
  private monitorInterval: NodeJS.Timeout | null = null;
  private lastProcessList: Map<number, ProcessInfo> = new Map();

  constructor(agentService: AgentService) {
    this.agentService = agentService;
  }

  start(): void {
    // Monitor processes every 10 seconds
    this.monitorInterval = setInterval(async () => {
      await this.collectAndSendProcesses();
    }, 10000);

    // Initial collection
    this.collectAndSendProcesses();

    console.log('Process monitor service started');
  }

  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    console.log('Process monitor service stopped');
  }

  private async collectAndSendProcesses(): Promise<void> {
    try {
      // Use systeminformation for process list (avoids ESM issues with ps-list)
      const cpuProcesses = await si.processes();

      const processInfos: ProcessInfo[] = cpuProcesses.list
        .filter(p => p.name) // Filter out empty process names
        .map(p => ({
          processName: p.name,
          processId: p.pid,
          path: p.path || p.command || '',
          cpuUsage: p.cpu || 0,
          memoryUsage: p.mem || 0,
          username: p.user || '',
        }));

      // Update cache
      this.lastProcessList.clear();
      for (const proc of processInfos) {
        this.lastProcessList.set(proc.processId, proc);
      }

      // Send to server
      this.agentService.sendProcessList(processInfos);
    } catch (error) {
      console.error('Failed to collect processes:', error);
    }
  }

  getProcessList(): ProcessInfo[] {
    return Array.from(this.lastProcessList.values());
  }

  async killProcess(pid: number): Promise<boolean> {
    try {
      process.kill(pid);
      return true;
    } catch (error) {
      console.error(`Failed to kill process ${pid}:`, error);
      return false;
    }
  }
}
