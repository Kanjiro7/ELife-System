import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

/**
 * Creates a 24-hour format timestamp for JST timezone
 * Japan Standard Time is UTC+9, format: YYYY-MM-DD HH:MM:SS
 */
function createJSTTimestamp(hours = 22, minutes = 0, seconds = 0) {
    const now = new Date();
    // Add 9 hours to UTC to get JST
    const jstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    
    // Set specific time for system logout (22:00 JST)
    const year = jstTime.getUTCFullYear();
    const month = String(jstTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstTime.getUTCDate()).padStart(2, '0');
    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    
    return `${year}-${month}-${day} ${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}

/**
 * Checks for students who have logged in but not logged out today
 * Adds system-fix logout at 22:00 JST for missing logouts
 * This function is scheduled to run daily at 22:00 JST (13:00 UTC)
 */
export const checkMissingLogouts = webMethod(
    Permissions.Anyone,
    async () => {
        try {
            console.log("=== CHECKING MISSING LOGOUTS ===");
            
            // Get current date in JST
            const now = new Date();
            const jstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
            
            // Define today's date range in JST format for comparison
            const year = jstTime.getUTCFullYear();
            const month = String(jstTime.getUTCMonth() + 1).padStart(2, '0');
            const day = String(jstTime.getUTCDate()).padStart(2, '0');
            const todayPrefix = `${year}-${month}-${day}`;
            
            console.log(`Checking attendance for date: ${todayPrefix}`);
            
            // Get all students with elevated permissions
            const elevatedQuery = elevate(wixData.query);
            const studentsResult = await elevatedQuery("Students").find();
            
            let processedCount = 0;
            let systemLogoutsAdded = 0;
            
            for (const student of studentsResult.items) {
                const history = student.attendanceHistory || [];
                processedCount++;
                
                // Filter records for today based on date string prefix
                const todayRecords = history.filter(record => {
                    return record.date && record.date.startsWith(todayPrefix);
                });
                
                if (todayRecords.length === 0) {
                    // No attendance records for today, skip
                    continue;
                }
                
                // Count logins and logouts for today
                const logins = todayRecords.filter(r => r.status === "login");
                const logouts = todayRecords.filter(r => r.status === "logout");
                
                console.log(`Student ${student.name}: ${logins.length} logins, ${logouts.length} logouts`);
                
                if (logins.length > logouts.length) {
                    // Missing logout detected - add system logout at 22:00 JST
                    const systemLogoutTimestamp = createJSTTimestamp(22, 0, 0);
                    
                    // Check if system logout already exists for today
                    const hasSystemLogout = todayRecords.some(record => 
                        record.status === "logout" && record.type === "system-fix"
                    );
                    
                    if (!hasSystemLogout) {
                        const updatedHistory = [...history, {
                            date: systemLogoutTimestamp,
                            status: "logout",
                            type: "system-fix" // Identifies this as an automated system correction
                        }];
                        
                        // Update student record with elevated permissions
                        const elevatedUpdate = elevate(wixData.update);
                        await elevatedUpdate("Students", {
                            _id: student._id,
                            attendanceHistory: updatedHistory
                        });
                        
                        systemLogoutsAdded++;
                        console.log(`Added system logout for student: ${student.name || 'Unknown'} at ${systemLogoutTimestamp}`);
                    } else {
                        console.log(`System logout already exists for student: ${student.name || 'Unknown'}`);
                    }
                }
            }
            
            console.log(`Missing logout check completed. Processed ${processedCount} students, added ${systemLogoutsAdded} system logouts`);
            
            return { 
                success: true, 
                processedStudents: processedCount,
                systemLogoutsAdded: systemLogoutsAdded,
                checkDate: todayPrefix
            };
            
        } catch (error) {
            console.error("Error in checkMissingLogouts:", error);
            throw new Error(`Failed to check missing logouts: ${error.message}`);
        }
    }
);

/**
 * Manual trigger function for testing purposes
 * Can be called from frontend for testing the system
 */
export const manualCheckMissingLogouts = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            console.log("=== MANUAL TRIGGER: CHECKING MISSING LOGOUTS ===");
            return await checkMissingLogouts();
        } catch (error) {
            console.error("Error in manual check:", error);
            throw error;
        }
    }
);

/**
 * Get system check statistics for admin dashboard
 * Returns information about recent system checks and corrections
 */
export const getSystemCheckStats = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            const elevatedQuery = elevate(wixData.query);
            const studentsResult = await elevatedQuery("Students").find();
            
            let totalSystemFixes = 0;
            let studentsWithFixes = 0;
            
            // Get current date for filtering recent fixes
            const now = new Date();
            const jstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
            const last7Days = new Date(jstTime.getTime() - (7 * 24 * 60 * 60 * 1000));
            const last7DaysPrefix = last7Days.toISOString().substring(0, 10);
            
            for (const student of studentsResult.items) {
                const history = student.attendanceHistory || [];
                
                const systemFixes = history.filter(record => 
                    record.type === "system-fix" && 
                    record.date >= last7DaysPrefix
                );
                
                if (systemFixes.length > 0) {
                    studentsWithFixes++;
                    totalSystemFixes += systemFixes.length;
                }
            }
            
            return {
                success: true,
                totalSystemFixes: totalSystemFixes,
                studentsWithFixes: studentsWithFixes,
                totalStudents: studentsResult.items.length,
                checkPeriod: "Last 7 days"
            };
            
        } catch (error) {
            console.error("Error getting system stats:", error);
            throw new Error(`Failed to get system statistics: ${error.message}`);
        }
    }
);
