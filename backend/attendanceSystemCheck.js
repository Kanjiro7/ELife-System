import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

/**
 * Creates a 24-hour format timestamp for JST timezone
 * Japan Standard Time is UTC+9, format: YYYY-MM-DD HH:MM:SS
 * Enhanced with better date handling and validation
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
 * Checks if a student needs automatic logout based on their attendance history
 * Focuses on the LAST record to determine if student is still logged in
 * More accurate than just counting login/logout totals
 */
function needsAutomaticLogout(attendanceHistory, todayPrefix) {
    if (!attendanceHistory || attendanceHistory.length === 0) {
        return false;
    }
    
    // Filter records for today and sort by date/time
    const todayRecords = attendanceHistory
        .filter(record => record.date && record.date.startsWith(todayPrefix))
        .sort((a, b) => a.date.localeCompare(b.date));
    
    if (todayRecords.length === 0) {
        return false;
    }
    
    // Get the last record for today
    const lastRecord = todayRecords[todayRecords.length - 1];
    
    // Check if last record is a login (student is still logged in)
    const isLastRecordLogin = lastRecord.status === "login";
    
    // Check if there's already a system-fix logout for today
    const hasSystemLogout = todayRecords.some(record => 
        record.status === "logout" && record.type === "system-fix"
    );
    
    console.log(`Last record status: ${lastRecord.status}, Has system logout: ${hasSystemLogout}`);
    
    return isLastRecordLogin && !hasSystemLogout;
}

/**
 * Checks for students who have logged in but not logged out today
 * Adds system-fix logout at 22:00 JST for missing logouts
 * This function is scheduled to run daily at 22:00 JST (13:00 UTC)
 * FIXED: Now properly preserves all database fields and checks last attendance status
 */
export const checkMissingLogouts = webMethod(
    Permissions.Anyone,
    async () => {
        try {
            console.log("=== CHECKING MISSING LOGOUTS - ENHANCED VERSION ===");
            
            // Get current date in JST
            const now = new Date();
            const jstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
            
            // Define today's date range in JST format for comparison
            const year = jstTime.getUTCFullYear();
            const month = String(jstTime.getUTCMonth() + 1).padStart(2, '0');
            const day = String(jstTime.getUTCDate()).padStart(2, '0');
            const todayPrefix = `${year}-${month}-${day}`;
            
            console.log(`Checking attendance for date: ${todayPrefix}`);
            console.log(`Current JST time: ${jstTime.toISOString()}`);
            
            // Get all students with elevated permissions
            const elevatedQuery = elevate(wixData.query);
            const studentsResult = await elevatedQuery("Students").find();
            
            let processedCount = 0;
            let systemLogoutsAdded = 0;
            let studentsAnalyzed = [];
            
            for (const student of studentsResult.items) {
                const history = student.attendanceHistory || [];
                processedCount++;
                
                console.log(`\n--- ANALYZING STUDENT: ${student.name || 'Unknown'} ---`);
                console.log(`Student ID: ${student._id}`);
                console.log(`Total attendance records: ${history.length}`);
                
                // Filter records for today based on date string prefix
                const todayRecords = history.filter(record => {
                    return record.date && record.date.startsWith(todayPrefix);
                });
                
                console.log(`Today's records: ${todayRecords.length}`);
                
                if (todayRecords.length === 0) {
                    console.log("No attendance records for today, skipping");
                    studentsAnalyzed.push({
                        name: student.name,
                        action: "skipped",
                        reason: "no_records_today"
                    });
                    continue;
                }
                
                // Log today's records for debugging
                todayRecords.forEach((record, index) => {
                    console.log(`  Record ${index + 1}: ${record.date} - ${record.status} (${record.type || 'user-input'})`);
                });
                
                // Check if student needs automatic logout using improved logic
                const needsLogout = needsAutomaticLogout(history, todayPrefix);
                console.log(`Needs automatic logout: ${needsLogout}`);
                
                if (needsLogout) {
                    // Add system logout at 22:00 JST
                    const systemLogoutTimestamp = createJSTTimestamp(22, 0, 0);
                    
                    console.log(`Adding system logout at: ${systemLogoutTimestamp}`);
                    
                    // Create new attendance record
                    const newLogoutRecord = {
                        date: systemLogoutTimestamp,
                        status: "logout",
                        type: "system-fix" // Identifies this as an automated system correction
                    };
                    
                    // CRITICAL: Use spread operator to preserve ALL existing fields
                    // This prevents data loss that occurred in the original code
                    const updatedStudent = {
                        ...student, // Preserve all existing student fields
                        attendanceHistory: [...history, newLogoutRecord] // Add new logout record
                    };
                    
                    // Verify all essential fields are preserved
                    console.log(`Preserved fields check:`, {
                        hasName: !!updatedStudent.name,
                        hasChildId: !!updatedStudent.childId,
                        hasEmail: !!updatedStudent.email,
                        totalFields: Object.keys(updatedStudent).length,
                        attendanceRecords: updatedStudent.attendanceHistory.length
                    });
                    
                    // Update student record with elevated permissions and complete field preservation
                    const elevatedUpdate = elevate(wixData.update);
                    await elevatedUpdate("Students", updatedStudent);
                    
                    systemLogoutsAdded++;
                    console.log(`✅ Added system logout for student: ${student.name || 'Unknown'} at ${systemLogoutTimestamp}`);
                    
                    studentsAnalyzed.push({
                        name: student.name,
                        action: "system_logout_added",
                        timestamp: systemLogoutTimestamp
                    });
                } else {
                    console.log(`No action needed for student: ${student.name || 'Unknown'}`);
                    studentsAnalyzed.push({
                        name: student.name,
                        action: "no_action_needed",
                        reason: "already_logged_out_or_has_system_fix"
                    });
                }
            }
            
            console.log(`\n=== MISSING LOGOUT CHECK COMPLETED ===`);
            console.log(`Processed ${processedCount} students`);
            console.log(`Added ${systemLogoutsAdded} system logouts`);
            console.log(`Check date: ${todayPrefix}`);
            
            return { 
                success: true, 
                processedStudents: processedCount,
                systemLogoutsAdded: systemLogoutsAdded,
                checkDate: todayPrefix,
                studentsAnalyzed: studentsAnalyzed,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error("❌ Error in checkMissingLogouts:", error);
            console.error("Error stack:", error.stack);
            throw new Error(`Failed to check missing logouts: ${error.message}`);
        }
    }
);

/**
 * Manual trigger function for testing purposes
 * Can be called from frontend for testing the system
 * Enhanced with better error handling and detailed logging
 */
export const manualCheckMissingLogouts = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            console.log("=== MANUAL TRIGGER: CHECKING MISSING LOGOUTS ===");
            console.log(`Triggered at: ${new Date().toISOString()}`);
            console.log(`JST time: ${new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString()}`);
            
            const result = await checkMissingLogouts();
            
            console.log("=== MANUAL TRIGGER COMPLETED ===");
            console.log("Result:", result);
            
            return result;
        } catch (error) {
            console.error("❌ Error in manual check:", error);
            throw error;
        }
    }
);

/**
 * Get system check statistics for admin dashboard
 * Returns information about recent system checks and corrections
 * Enhanced with more detailed statistics
 */
export const getSystemCheckStats = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            console.log("=== GETTING SYSTEM CHECK STATISTICS ===");
            
            const elevatedQuery = elevate(wixData.query);
            const studentsResult = await elevatedQuery("Students").find();
            
            let totalSystemFixes = 0;
            let studentsWithFixes = 0;
            let recentSystemFixes = [];
            
            // Get current date for filtering recent fixes
            const now = new Date();
            const jstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
            const last7Days = new Date(jstTime.getTime() - (7 * 24 * 60 * 60 * 1000));
            
            // Format for comparison (YYYY-MM-DD)
            const last7DaysStr = last7Days.toISOString().substring(0, 10);
            
            console.log(`Checking system fixes since: ${last7DaysStr}`);
            
            for (const student of studentsResult.items) {
                const history = student.attendanceHistory || [];
                
                // Find system fixes in the last 7 days
                const systemFixes = history.filter(record => 
                    record.type === "system-fix" && 
                    record.date && 
                    record.date.substring(0, 10) >= last7DaysStr
                );
                
                if (systemFixes.length > 0) {
                    studentsWithFixes++;
                    totalSystemFixes += systemFixes.length;
                    
                    // Add to recent fixes for detailed reporting
                    systemFixes.forEach(fix => {
                        recentSystemFixes.push({
                            studentName: student.name || 'Unknown',
                            date: fix.date,
                            status: fix.status
                        });
                    });
                }
            }
            
            console.log(`Found ${totalSystemFixes} system fixes for ${studentsWithFixes} students`);
            
            return {
                success: true,
                totalSystemFixes: totalSystemFixes,
                studentsWithFixes: studentsWithFixes,
                totalStudents: studentsResult.items.length,
                checkPeriod: "Last 7 days",
                recentFixes: recentSystemFixes.slice(0, 10), // Latest 10 fixes
                generatedAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.error("❌ Error getting system stats:", error);
            throw new Error(`Failed to get system statistics: ${error.message}`);
        }
    }
);
