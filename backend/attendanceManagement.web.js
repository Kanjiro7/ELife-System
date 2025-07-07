import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

/**
 * Get current parent data based on authenticated member
 * Returns parent record with assigned students or null if not a parent
 */
export const getCurrentParentData = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            const member = await currentMember.getMember();
            if (!member) {
                return null;
            }
            
            const elevatedQuery = elevate(wixData.query);
            const results = await elevatedQuery("Parents")
                .eq("memberReference", member._id)
                .include("assignedStudents")
                .find();
            
            return results.items.length > 0 ? results.items[0] : null;
            
        } catch (error) {
            console.error("Error in getCurrentParentData:", error);
            return null;
        }
    }
);

/**
 * Get attendance history for a specific student
 * Verifies parent authorization before returning data
 * Language parameter determines date format (ja = Japanese, en = English)
 */
export const getStudentAttendanceHistory = webMethod(
    Permissions.SiteMember,
    async (studentId, language = 'en') => {
        try {
            if (!studentId) {
                throw new Error("Student ID is required");
            }
            
            // Verify parent authorization
            const parentData = await getCurrentParentData();
            if (!parentData) {
                throw new Error("No parent data found - access denied");
            }

            const assignedStudentIds = parentData.assignedStudents.map(student => student._id);
            if (!assignedStudentIds.includes(studentId)) {
                throw new Error("Unauthorized: Student not assigned to this parent");
            }

            // Get student attendance data
            const elevatedQuery = elevate(wixData.query);
            const studentResults = await elevatedQuery("Students")
                .eq("_id", studentId)
                .find();

            if (studentResults.items.length === 0) {
                throw new Error("Student not found");
            }

            const student = studentResults.items[0];
            const attendanceHistory = student.attendanceHistory || [];

            // Format data for frontend display with language support
            const formattedData = formatAttendanceData(attendanceHistory, student.name, language);

            return {
                studentName: student.name,
                attendanceData: formattedData
            };
            
        } catch (error) {
            console.error("Error in getStudentAttendanceHistory:", error);
            throw new Error(`Failed to get attendance history: ${error.message}`);
        }
    }
);

/**
 * Format attendance data for table display
 * Groups multiple login/logout events per day and handles system-fix status
 * Supports multilingual date formatting (English/Japanese)
 */
function formatAttendanceData(attendanceHistory, studentName, language = 'en') {
    // Map for Japanese day kanji characters
    const dayKanjiMap = {
        'Sunday': '日',
        'Monday': '月',
        'Tuesday': '火',
        'Wednesday': '水',
        'Thursday': '木',
        'Friday': '金',
        'Saturday': '土'
    };

    // Group records by date (YYYY/MM/DD)
    const grouped = {};

    attendanceHistory.forEach(record => {
        // Parse date from record (handles multiple timestamp formats)
        let dateObj;
        try {
            if (record.date.includes('JST') || record.date.includes('T')) {
                // Handle ISO format or JST format from legacy data
                dateObj = new Date(record.date.replace(' JST', ''));
            } else {
                // Handle current format YYYY-MM-DD HH:MM:SS
                dateObj = new Date(record.date);
            }
        } catch (error) {
            console.error("Error parsing date:", record.date, error);
            return; // Skip invalid date records
        }

        // Validate parsed date
        if (isNaN(dateObj.getTime())) {
            console.error("Invalid date object:", record.date);
            return; // Skip invalid dates
        }

        // Format date string for grouping (YYYY/MM/DD)
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}/${month}/${day}`;

        // Get day name in English for formatting
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

        // Format date display based on language parameter
        let dateDisplay = '';
        if (language === 'ja') {
            // Japanese format: YYYY/MM/DD Kanji
            const kanji = dayKanjiMap[dayName] || '';
            dateDisplay = `${year}/${month}/${day} ${kanji}`;
        } else {
            // English format: YYYY/MM/DD, Day
            dateDisplay = `${year}/${month}/${day}, ${dayName}`;
        }

        // Initialize date group if doesn't exist
        if (!grouped[dateKey]) {
            grouped[dateKey] = {
                studentName: studentName,
                date: dateDisplay,
                login: [],
                logout: [],
                sortDate: dateObj.getTime()
            };
        }

        // Format time as HH:MM (24h format)
        const time = dateObj.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        // Add login/logout events to respective arrays
        if (record.status === 'login') {
            grouped[dateKey].login.push(time);
        } else if (record.status === 'logout') {
            // Check for system-fix status (supports both old and new field names)
            if (record.type === 'system-fix' || record.systemfix === true) {
                grouped[dateKey].logout.push('#'); // Show # for system fixes
            } else {
                grouped[dateKey].logout.push(time);
            }
        }
    });

    // Convert grouped data to array and format login/logout as multiline strings
    const rows = Object.values(grouped).map(item => ({
        studentName: item.studentName,
        date: item.date,
        login: item.login.join('\n'),    // Multiple logins on separate lines
        logout: item.logout.join('\n'),  // Multiple logouts on separate lines
        sortDate: item.sortDate
    }));

    // Sort rows by date descending (newest first)
    rows.sort((a, b) => b.sortDate - a.sortDate);

    // Remove sortDate from final result for table display
    return rows.map(item => {
        const { sortDate, ...result } = item;
        return result;
    });
}

/**
 * Get attendance statistics for admin dashboard
 * Returns summary data about student attendance patterns
 */
export const getAttendanceStatistics = webMethod(
    Permissions.SiteMember,
    async (studentId, daysBack = 30) => {
        try {
            if (!studentId) {
                throw new Error("Student ID is required");
            }

            // Verify parent authorization
            const parentData = await getCurrentParentData();
            if (!parentData) {
                throw new Error("No parent data found - access denied");
            }

            const assignedStudentIds = parentData.assignedStudents.map(student => student._id);
            if (!assignedStudentIds.includes(studentId)) {
                throw new Error("Unauthorized: Student not assigned to this parent");
            }

            // Get student data
            const elevatedQuery = elevate(wixData.query);
            const studentResults = await elevatedQuery("Students")
                .eq("_id", studentId)
                .find();

            if (studentResults.items.length === 0) {
                throw new Error("Student not found");
            }

            const student = studentResults.items[0];
            const attendanceHistory = student.attendanceHistory || [];

            // Calculate date range for statistics
            const now = new Date();
            const cutoffDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

            // Filter recent records
            const recentRecords = attendanceHistory.filter(record => {
                let dateObj;
                try {
                    if (record.date.includes('JST') || record.date.includes('T')) {
                        dateObj = new Date(record.date.replace(' JST', ''));
                    } else {
                        dateObj = new Date(record.date);
                    }
                    return dateObj >= cutoffDate;
                } catch (error) {
                    return false;
                }
            });

            // Calculate statistics
            const totalLogins = recentRecords.filter(r => r.status === 'login').length;
            const totalLogouts = recentRecords.filter(r => r.status === 'logout').length;
            const systemFixes = recentRecords.filter(r => 
                r.status === 'logout' && (r.type === 'system-fix' || r.systemfix === true)
            ).length;

            // Group by date to count attendance days
            const dailyGroups = {};
            recentRecords.forEach(record => {
                let dateObj;
                try {
                    if (record.date.includes('JST') || record.date.includes('T')) {
                        dateObj = new Date(record.date.replace(' JST', ''));
                    } else {
                        dateObj = new Date(record.date);
                    }
                    const dateKey = dateObj.toDateString();
                    if (!dailyGroups[dateKey]) {
                        dailyGroups[dateKey] = [];
                    }
                    dailyGroups[dateKey].push(record);
                } catch (error) {
                    // Skip invalid dates
                }
            });

            const attendanceDays = Object.keys(dailyGroups).length;

            return {
                success: true,
                studentName: student.name,
                periodDays: daysBack,
                attendanceDays: attendanceDays,
                totalLogins: totalLogins,
                totalLogouts: totalLogouts,
                systemFixes: systemFixes,
                attendanceRate: daysBack > 0 ? ((attendanceDays / daysBack) * 100).toFixed(1) : 0
            };

        } catch (error) {
            console.error("Error in getAttendanceStatistics:", error);
            throw new Error(`Failed to get attendance statistics: ${error.message}`);
        }
    }
);
