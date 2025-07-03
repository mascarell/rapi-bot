/**
 * Uptime Service
 * 
 * Provides uptime tracking for the Discord bot in containerized environments.
 * Focuses on current session uptime and deployment information.
 * 
 * @author Rapi Bot Development Team
 * @version 1.0.0
 */
export class UptimeService {
    private static instance: UptimeService;
    private startTime: number;
    private deploymentId: string;
    private commandsExecuted: number = 0;

    private constructor() {
        this.startTime = Date.now();
        this.deploymentId = this.generateDeploymentId();
    }

    /**
     * Get singleton instance of UptimeService
     */
    public static getInstance(): UptimeService {
        if (!UptimeService.instance) {
            UptimeService.instance = new UptimeService();
        }
        return UptimeService.instance;
    }

    /**
     * Get current uptime in milliseconds
     */
    public getUptime(): number {
        return Date.now() - this.startTime;
    }

    /**
     * Get formatted uptime string
     */
    public getFormattedUptime(): string {
        return this.formatDuration(this.getUptime());
    }

    /**
     * Increment command execution count
     */
    public incrementCommands(): void {
        this.commandsExecuted++;
    }

    /**
     * Get total commands executed
     */
    public getCommandsExecuted(): number {
        return this.commandsExecuted;
    }

    /**
     * Get deployment information
     */
    public getDeploymentInfo() {
        const uptime = this.getUptime();
        const startDate = new Date(this.startTime);
        
        return {
            uptime,
            formattedUptime: this.formatDuration(uptime),
            startTime: this.startTime,
            startDate: startDate.toISOString(),
            deploymentId: this.deploymentId,
            commandsExecuted: this.commandsExecuted
        };
    }

    /**
     * Generate a unique deployment ID for this session
     */
    private generateDeploymentId(): string {
        // Use timestamp + random string for uniqueness
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `${timestamp}-${random}`;
    }

    /**
     * Format duration from milliseconds to human readable string
     */
    private formatDuration(ms: number): string {
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        
        const parts: string[] = [];
        
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
        
        return parts.join(' ');
    }

    /**
     * Reset the uptime service (useful for testing)
     */
    public reset(): void {
        this.startTime = Date.now();
        this.deploymentId = this.generateDeploymentId();
        this.commandsExecuted = 0;
    }
}

// Export a convenience function for easy access
export const getUptimeService = () => UptimeService.getInstance(); 