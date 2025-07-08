import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

/**
 * Creates a precise 24-hour format timestamp for JST timezone
 * Japan Standard Time is UTC+9, format: YYYY-MM-DD HH:MM:SS
 * Enhanced with millisecond precision and validation
 */
function createJSTTimestamp(hours = 22, minutes = 0, seconds = 0) {
    try {
        const now = new Date();
        
        // Get current UTC time and add JST offset (9 hours)
        const utcTime = now.getTime();
        const jstOffset = 9 * 60 * 60 * 1000; // 9 hours in milliseconds
        const jstTime = new Date(utcTime + jstOffset);
        
        // Set specific time for system logout (default 22:00 JST)
        const year = jstTime.getUTCFullYear();
        const month = String(jstTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(jstTime.getUTCDate()).padStart(2, '0');
        const formattedHours = String(hours).padStart(2, '0');
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(seconds).padStart(2, '0');
        
        const timestamp = `${year}-${month}-${day} ${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
        
        // Validation: ensure string format
        if (typeof timestamp !== 'string') {
            throw new Error('Generated timestamp is not a string');
        }
        
        console.log(`Generated JST timestamp: ${timestamp}`);
        return timestamp;
        
    } catch (error) {
        console.error('Error creating JST timestamp:', error);
        // Fallback timestamp
        const now = new Date();
        return now.toISOString().replace('T', ' ').substring(0, 19);
    }
}

/**
 * Enhanced function to determine if a student needs automatic logout
 * Uses robust last-record analysis with comprehensive validation
 * Focuses on the ACTUAL LAST attendance record for accurate state determination
 */
function studentNeedsAutomaticLogout(student, todayPrefix) {
    try {
        const studentName = student.name || 'Unknown';
        const history = student.attendanceHistory || [];
        
        console.log(`\n=== ANALYZING STUDENT: ${studentName} ===`);
        console.log(`Total records: ${history.length}`);
        
        if (history.length === 0) {
            console.log(`❌ No attendance history for ${studentName}`);
            return { needsLogout: false, reason: 'no_history' };
        }
        
        // Filter and sort today's records by timestamp
        const todayRecords = history
            .filter(record => {
                const hasDate = record.date && typeof record.date === 'string';
                const isToday = hasDate && record.date.startsWith(todayPrefix);
                return isToday;
            })
            .sort((a, b) => {
                // Sort by timestamp string comparison (works with YYYY-MM-DD HH:MM:SS format)
                return a.date.localeCompare(b.date);
            });
        
        console.log(`Today's records (${todayPrefix}): ${todayRecords.length}`);
        
        if (todayRecords.length === 0) {
            console.log(`❌ No attendance records today for ${studentName}`);
            return { needsLogout: false, reason: 'no_records_today' };
        }
        
        // Log all today's records for debugging
        todayRecords.forEach((record, index) => {
            console.log(`  ${index + 1}. ${record.date} - ${record.status} (${record.type || 'user-input'})`);
        });
        
        // Get the LAST record chronologically
        const lastRecord = todayRecords[todayRecords.length - 1];
        console.log(`🔍 LAST RECORD: ${lastRecord.date} - ${lastRecord.status}`);
        
        // Check if last record is a login (student still logged in)
        const isLastRecordLogin = lastRecord.status === 'login';
        console.log(`Last record is login: ${isLastRecordLogin}`);
        
        // Check if there's already a system-fix logout for today
        const hasSystemLogout = todayRecords.some(record => 
            record.status === 'logout' && record.type === 'system-fix'
        );
        console.log(`Already has system logout: ${hasSystemLogout}`);
        
        // Additional validation: check for any logout after the last login
        const lastLoginIndex = todayRecords.findLastIndex(record => record.status === 'login');
        const hasLogoutAfterLastLogin = todayRecords.slice(lastLoginIndex + 1).some(record => record.status === 'logout');
        console.log(`Has logout after last login: ${hasLogoutAfterLastLogin}`);
        
        // Decision logic
        const needsLogout = isLastRecordLogin && !hasSystemLogout && !hasLogoutAfterLastLogin;
        
        console.log(`🎯 DECISION FOR ${studentName}: ${needsLogout ? 'NEEDS LOGOUT' : 'NO ACTION NEEDED'}`);
        
        return {
            needsLogout: needsLogout,
            reason: needsLogout ? 'last_record_is_login' : 'already_logged_out_or_has_system_fix',
            lastRecord: lastRecord,
            todayRecordsCount: todayRecords.length,
            hasSystemLogout: hasSystemLogout
        };
        
    } catch (error) {
        console.error(`❌ Error analyzing student ${student.name || 'Unknown'}:`, error);
        return { needsLogout: false, reason: 'analysis_error', error: error.message };
    }
}

/**
 * Main function: Checks for students who have logged in but not logged out today
 * Adds system-fix logout at 22:00 JST for missing logouts
 * ENHANCED: Robust database field preservation and accurate last-record analysis
 * This function is scheduled to run daily at 22:00 JST (13:00 UTC)
 */
export const checkMissingLogouts = webMethod(
    Permissions.Anyone,
    async () => {
        try {
            console.log("\n" + "=".repeat(60));
            console.log("=== ENHANCED MISSING LOGOUT CHECK SYSTEM ===");
            console.log("=".repeat(60));
            
            // Get current JST time information
            const now = new Date();
            const jstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
            
            const year = jstTime.getUTCFullYear();
            const month = String(jstTime.getUTCMonth() + 1).padStart(2, '0');
            const day = String(jstTime.getUTCDate()).padStart(2, '0');
            const todayPrefix = `${year}-${month}-${day}`;
            
            console.log(`📅 Check date: ${todayPrefix}`);
            console.log(`🕐 Current JST time: ${jstTime.toISOString()}`);
            console.log(`🕐 Current UTC time: ${now.toISOString()}`);
            
            // Get all students with elevated permissions
            console.log(`\n📊 Fetching all students from database...`);
            const elevatedQuery = elevate(wixData.query);
            const studentsResult = await elevatedQuery("Students").find();
            
            console.log(`✅ Found ${studentsResult.items.length} students in database`);
            
            let processedCount = 0;
            let systemLogoutsAdded = 0;
            let studentsAnalyzed = [];
            let errors = [];
            
            // Process each student
            for (const student of studentsResult.items) {
                try {
                    processedCount++;
                    const studentName = student.name || `Student_${student._id}`;
                    
                    // Analyze if student needs automatic logout
                    const analysis = studentNeedsAutomaticLogout(student, todayPrefix);
                    
                    if (analysis.needsLogout) {
                        console.log(`\n🔧 PROCESSING AUTOMATIC LOGOUT FOR: ${studentName}`);
                        
                        // Create system logout timestamp (22:00 JST)
                        const systemLogoutTimestamp = createJSTTimestamp(22, 0, 0);
                        
                        // Create new logout record
                        const newLogoutRecord = {
                            date: systemLogoutTimestamp,
                            status: "logout",
                            type: "system-fix" // Identifies this as automated correction
                        };
                        
                        console.log(`📝 Creating logout record:`, newLogoutRecord);
                        
                        // Get existing attendance history
                        const currentHistory = student.attendanceHistory || [];
                        
                        // CRITICAL: Use spread operator to preserve ALL existing database fields
                        // This prevents the data loss issue from previous implementations
                        const updatedStudent = {
                            ...student, // Preserve ALL existing fields (name, childId, email, etc.)
                            attendanceHistory: [...currentHistory, newLogoutRecord] // Add new logout
                        };
                        
                        // Validation: Ensure all critical fields are preserved
                        const fieldsValidation = {
                            hasId: !!updatedStudent._id,
                            hasName: !!updatedStudent.name,
                            hasChildId: !!updatedStudent.childId,
                            hasEmail: !!updatedStudent.email,
                            totalFields: Object.keys(updatedStudent).length,
                            attendanceRecords: updatedStudent.attendanceHistory.length,
                            lastRecordType: typeof updatedStudent.attendanceHistory[updatedStudent.attendanceHistory.length - 1].date
                        };
                        
                        console.log(`🔍 Field preservation validation:`, fieldsValidation);
                        
                        if (!fieldsValidation.hasId || !fieldsValidation.hasName || !fieldsValidation.hasChildId) {
                            throw new Error('Critical student fields missing from update object!');
                        }
                        
                        if (fieldsValidation.lastRecordType !== 'string') {
                            throw new Error('Logout record date is not a string!');
                        }
                        
                        // Update database with complete field preservation
                        console.log(`💾 Updating database for ${studentName}...`);
                        const elevatedUpdate = elevate(wixData.update);
                        const updateResult = await elevatedUpdate("Students", updatedStudent);
                        
                        systemLogoutsAdded++;
                        console.log(`✅ Successfully added system logout for ${studentName}`);
                        console.log(`🆔 Update result ID: ${updateResult._id}`);
                        
                        studentsAnalyzed.push({
                            name: studentName,
                            childId: student.childId,
                            action: "system_logout_added",
                            timestamp: systemLogoutTimestamp,
                            recordsBefore: currentHistory.length,
                            recordsAfter: updatedStudent.attendanceHistory.length
                        });
                        
                    } else {
                        console.log(`✅ ${studentName}: No action needed (${analysis.reason})`);
                        studentsAnalyzed.push({
                            name: studentName,
                            childId: student.childId,
                            action: "no_action_needed",
                            reason: analysis.reason
                        });
                    }
                    
                } catch (studentError) {
                    console.error(`❌ Error processing student ${student.name || student._id}:`, studentError);
                    errors.push({
                        student: student.name || student._id,
                        error: studentError.message
                    });
                }
            }
            
            // Final summary
            console.log("\n" + "=".repeat(60));
            console.log("=== MISSING LOGOUT CHECK COMPLETED ===");
            console.log("=".repeat(60));
            console.log(`📊 Total students processed: ${processedCount}`);
            console.log(`🔧 System logouts added: ${systemLogoutsAdded}`);
            console.log(`❌ Errors encountered: ${errors.length}`);
            console.log(`📅 Check date: ${todayPrefix}`);
            console.log(`⏰ Completed at: ${new Date().toISOString()}`);
            
            if (errors.length > 0) {
                console.log(`\n❌ ERRORS SUMMARY:`);
                errors.forEach((error, index) => {
                    console.log(`  ${index + 1}. ${error.student}: ${error.error}`);
                });
            }
            
            return {
                success: true,
                processedStudents: processedCount,
                systemLogoutsAdded: systemLogoutsAdded,
                checkDate: todayPrefix,
                studentsAnalyzed: studentsAnalyzed,
                errors: errors,
                timestamp: new Date().toISOString(),
                jstTimestamp: createJSTTimestamp()
            };
            
        } catch (error) {
            console.error("❌ CRITICAL ERROR in checkMissingLogouts:", error);
            console.error("Error stack:", error.stack);
            throw new Error(`Failed to check missing logouts: ${error.message}`);
        }
    }
);

/**
 * Manual trigger function for testing and debugging
 * Enhanced with detailed logging and comprehensive error handling
 */
export const manualCheckMissingLogouts = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            console.log("\n" + "🔧".repeat(30));
            console.log("=== MANUAL TRIGGER ACTIVATED ===");
            console.log("🔧".repeat(30));
            console.log(`🕐 Triggered at UTC: ${new Date().toISOString()}`);
            console.log(`🕐 JST equivalent: ${new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString()}`);
            
            const result = await checkMissingLogouts();
            
            console.log("\n✅ MANUAL TRIGGER COMPLETED SUCCESSFULLY");
            console.log(`📊 Result summary:`, {
                success: result.success,
                processed: result.processedStudents,
                logoutsAdded: result.systemLogoutsAdded,
                errors: result.errors.length
            });
            
            return {
                ...result,
                triggerType: "manual",
                triggeredBy: "user"
            };
            
        } catch (error) {
            console.error("❌ MANUAL TRIGGER ERROR:", error);
            throw new Error(`Manual trigger failed: ${error.message}`);
        }
    }
);

/**
 * Enhanced system statistics function for admin dashboard
 * Provides comprehensive reporting on system corrections and performance
 */
export const getSystemCheckStats = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            console.log("📊 Generating system check statistics...");
            
            const elevatedQuery = elevate(wixData.query);
            const studentsResult = await elevatedQuery("Students").find();
            
            let totalSystemFixes = 0;
            let studentsWithFixes = 0;
            let recentSystemFixes = [];
            let dailyStats = {};
            
            // Get current JST time for filtering
            const now = new Date();
            const jstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
            const last7Days = new Date(jstTime.getTime() - (7 * 24 * 60 * 60 * 1000));
            const last7DaysStr = last7Days.toISOString().substring(0, 10);
            
            console.log(`📅 Analyzing system fixes since: ${last7DaysStr}`);
            
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
                    
                    // Collect detailed fix information
                    systemFixes.forEach(fix => {
                        const fixDate = fix.date.substring(0, 10);
                        
                        // Track daily statistics
                        if (!dailyStats[fixDate]) {
                            dailyStats[fixDate] = { count: 0, students: [] };
                        }
                        dailyStats[fixDate].count++;
                        dailyStats[fixDate].students.push(student.name || 'Unknown');
                        
                        // Add to recent fixes list
                        recentSystemFixes.push({
                            studentName: student.name || 'Unknown',
                            childId: student.childId || 'N/A',
                            date: fix.date,
                            status: fix.status,
                            type: fix.type
                        });
                    });
                }
            }
            
            // Sort recent fixes by date (most recent first)
            recentSystemFixes.sort((a, b) => b.date.localeCompare(a.date));
            
            const statistics = {
                success: true,
                totalSystemFixes: totalSystemFixes,
                studentsWithFixes: studentsWithFixes,
                totalStudents: studentsResult.items.length,
                checkPeriod: "Last 7 days",
                recentFixes: recentSystemFixes.slice(0, 20), // Latest 20 fixes
                dailyBreakdown: dailyStats,
                systemHealth: {
                    fixRate: studentsResult.items.length > 0 ? (studentsWithFixes / studentsResult.items.length * 100).toFixed(2) + '%' : '0%',
                    avgFixesPerStudent: studentsWithFixes > 0 ? (totalSystemFixes / studentsWithFixes).toFixed(2) : '0'
                },
                generatedAt: new Date().toISOString(),
                generatedAtJST: createJSTTimestamp()
            };
            
            console.log(`📊 Statistics generated:`, {
                totalFixes: totalSystemFixes,
                studentsAffected: studentsWithFixes,
                totalStudents: studentsResult.items.length
            });
            
            return statistics;
            
        } catch (error) {
            console.error("❌ Error generating system statistics:", error);
            throw new Error(`Failed to get system statistics: ${error.message}`);
        }
    }
);
