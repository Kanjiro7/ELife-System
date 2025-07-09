import wixWindow from 'wix-window';
import wixData from 'wix-data';
import { getCurrentParentData, getStudentAttendanceHistory } from 'backend/attendanceManagement.web';

let currentParentData = null;
let selectedStudentId = null;
let fullAttendanceData = []; // Store complete attendance data for filtering
let selectedMonth = null; // Store selected month for filtering
let selectedDay = null; // Store selected day for highlighting

$w.onReady(async function() {
    // Initialize the page for all site members
    await initializePage();
    
    // Setup event handlers
    $w("#studentSelector").onChange(() => {
        handleStudentSelection();
    });
    
    // Setup birthday date picker event handler
    $w("#birthday").onChange(() => {
        handleBirthdayChange();
    });
    
    // Setup attendance month date picker event handler
    $w("#attendanceMonth").onChange(() => {
        handleAttendanceMonthChange();
    });
});

/**
 * Initialize page components and load initial data
 */
async function initializePage() {
    try {
        // Show loading state
        $w("#loadingText").show();
        $w("#studentSelector").disable();
        $w("#attendanceTable").hide();
        $w("#birthday").disable();
        $w("#attendanceMonth").disable();
        
        // Get current parent data (will be null for non-parents)
        currentParentData = await getCurrentParentData();
        
        // Populate student selector based on user type
        await populateStudentSelector();
        
        // Hide loading
        $w("#loadingText").hide();
        
    } catch (error) {
        console.error("Error initializing page:", error);
        showError("Failed to load page data. Please try again.");
        $w("#loadingText").hide();
    }
}

/**
 * Populate student selector dropdown based on user permissions
 */
async function populateStudentSelector() {
    try {
        let options = [];
        
        if (!currentParentData || !currentParentData.assignedStudents || currentParentData.assignedStudents.length === 0) {
            // User is not a parent or has no assigned students
            options = [{
                label: "No student assigned",
                value: "none"
            }];
            
            // Set the dropdown and clear the table
            $w("#studentSelector").options = options;
            $w("#studentSelector").value = "none";
            $w("#attendanceTable").rows = [];
            $w("#attendanceTable").hide();
            $w("#birthday").value = undefined;
            $w("#attendanceMonth").value = undefined;
        } else {
            // User is a parent with assigned students
            const assignedStudents = currentParentData.assignedStudents;
            
            // Create options for dropdown with student names
            options = assignedStudents.map(student => ({
                label: student.name,
                value: student._id
            }));
            
            // Populate dropdown
            $w("#studentSelector").options = options;
            
            // Auto-select first student and load their data
            if (options.length > 0) {
                $w("#studentSelector").value = options[0].value;
                selectedStudentId = options[0].value;
                await loadStudentData(selectedStudentId);
            }
        }
        
        $w("#studentSelector").enable();
        
    } catch (error) {
        console.error("Error populating student selector:", error);
        showError("Failed to load student list.");
    }
}

/**
 * Handle student selection change from dropdown
 */
async function handleStudentSelection() {
    try {
        const newSelectedId = $w("#studentSelector").value;
        
        // If "No student assigned" is selected, clear everything
        if (newSelectedId === "none") {
            $w("#attendanceTable").rows = [];
            $w("#attendanceTable").hide();
            $w("#birthday").value = undefined;
            $w("#attendanceMonth").value = undefined;
            $w("#birthday").disable();
            $w("#attendanceMonth").disable();
            selectedStudentId = null;
            fullAttendanceData = [];
            return;
        }
        
        // If a valid student is selected, load their data
        if (newSelectedId && newSelectedId !== selectedStudentId) {
            selectedStudentId = newSelectedId;
            await loadStudentData(selectedStudentId);
        }
    } catch (error) {
        console.error("Error handling student selection:", error);
        showError("Failed to load data for selected student.");
    }
}

/**
 * Load complete student data including attendance and birthday
 */
async function loadStudentData(studentId) {
    try {
        // Show loading state
        $w("#attendanceTable").hide();
        $w("#loadingText").text = "Loading student data...";
        $w("#loadingText").show();
        
        // Load attendance data
        await loadAttendanceData(studentId);
        
        // Load birthday data
        await loadBirthdayData(studentId);
        
        // Setup attendance month picker
        await setupAttendanceMonthPicker();
        
        // Enable date pickers
        $w("#birthday").enable();
        $w("#attendanceMonth").enable();
        
        $w("#loadingText").hide();
        
    } catch (error) {
        console.error("Error loading student data:", error);
        showError("Failed to load student data.");
        $w("#loadingText").hide();
    }
}

/**
 * Load birthday data for selected student
 */
async function loadBirthdayData(studentId) {
    try {
        // Query student data from database
        const studentQuery = await wixData.query("Students")
            .eq("_id", studentId)
            .find();
        
        if (studentQuery.items.length > 0) {
            const student = studentQuery.items[0];
            
            // Set birthday if exists, otherwise leave empty (shows placeholder)
            if (student.birthday) {
                $w("#birthday").value = new Date(student.birthday);
            } else {
                $w("#birthday").value = undefined;
            }
        }
        
    } catch (error) {
        console.error("Error loading birthday data:", error);
        // Don't show error for birthday loading failure
    }
}

/**
 * Handle birthday date picker change
 */
async function handleBirthdayChange() {
    try {
        const newBirthday = $w("#birthday").value;
        
        if (!selectedStudentId || selectedStudentId === "none") {
            return;
        }
        
        // Show loading progress
        $w("#loadingText").text = "Updating birthday...";
        $w("#loadingText").show();
        
        // Update student record in database
        await wixData.update("Students", {
            _id: selectedStudentId,
            birthday: newBirthday
        });
        
        // Hide loading
        $w("#loadingText").hide();
        
    } catch (error) {
        console.error("Error updating birthday:", error);
        showError("Failed to update birthday.");
        $w("#loadingText").hide();
    }
}

/**
 * Setup attendance month picker with available dates
 */
async function setupAttendanceMonthPicker() {
    try {
        if (fullAttendanceData.length === 0) {
            $w("#attendanceMonth").value = undefined;
            return;
        }
        
        // Extract unique months from attendance data
        const months = new Set();
        fullAttendanceData.forEach(record => {
            if (record.originalDate) {
                const date = new Date(record.originalDate);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                months.add(monthKey);
            }
        });
        
        // Reset month filter
        selectedMonth = null;
        selectedDay = null;
        $w("#attendanceMonth").value = undefined;
        
    } catch (error) {
        console.error("Error setting up attendance month picker:", error);
    }
}

/**
 * Handle attendance month date picker change
 */
async function handleAttendanceMonthChange() {
    try {
        const selectedDate = $w("#attendanceMonth").value;
        
        if (!selectedDate) {
            // No date selected, show all data
            selectedMonth = null;
            selectedDay = null;
            displayAttendanceTable(fullAttendanceData);
            return;
        }
        
        // Extract month and day from selected date
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const day = selectedDate.getDate();
        
        selectedMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
        selectedDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Filter data for selected month
        const filteredData = fullAttendanceData.filter(record => {
            if (record.originalDate) {
                const recordDate = new Date(record.originalDate);
                const recordMonth = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
                return recordMonth === selectedMonth;
            }
            return false;
        });
        
        displayAttendanceTable(filteredData);
        
    } catch (error) {
        console.error("Error handling attendance month change:", error);
        showError("Failed to filter attendance data.");
    }
}

/**
 * Load and process attendance data for selected student
 */
async function loadAttendanceData(studentId) {
    try {
        // Detect current site language for proper date formatting
        const currentLanguage = wixWindow.multilingual?.currentLanguage || 'en';
        
        // Get attendance history from backend
        const result = await getStudentAttendanceHistory(studentId, currentLanguage);
        
        if (result && result.attendanceData) {
            // Process raw attendance data into table format
            fullAttendanceData = processAttendanceData(result.rawAttendanceData || []);
            
            // Display processed data
            displayAttendanceTable(fullAttendanceData);
            
            console.log(`Loaded ${fullAttendanceData.length} attendance records for ${result.studentName}`);
        } else {
            // No data found, show empty table
            fullAttendanceData = [];
            $w("#attendanceTable").rows = [];
            showError("No attendance data found for this student.");
        }
        
    } catch (error) {
        console.error("Error loading attendance data:", error);
        showError("Failed to load attendance data.");
    }
}

/**
 * Process raw attendance data into table format
 * Groups login/logout pairs and sorts chronologically
 */
function processAttendanceData(rawData) {
    if (!rawData || rawData.length === 0) {
        return [];
    }
    
    // Sort data chronologically (oldest to newest)
    const sortedData = rawData.sort((a, b) => {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    
    // Group by day and create login/logout pairs
    const dayGroups = {};
    
    sortedData.forEach(record => {
        const date = new Date(record.date);
        const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        
        if (!dayGroups[dayKey]) {
            dayGroups[dayKey] = [];
        }
        
        dayGroups[dayKey].push(record);
    });
    
    // Convert groups to table rows
    const tableRows = [];
    
    Object.keys(dayGroups).sort().forEach(dayKey => {
        const dayRecords = dayGroups[dayKey];
        const date = new Date(dayRecords[0].date);
        const formattedDate = formatDate(date);
        
        // Process login/logout pairs
        let i = 0;
        while (i < dayRecords.length) {
            const currentRecord = dayRecords[i];
            
            if (currentRecord.status === 'login') {
                // Look for corresponding logout
                const logoutRecord = dayRecords.find((record, index) => 
                    index > i && record.status === 'logout'
                );
                
                if (logoutRecord) {
                    // Create pair row
                    tableRows.push({
                        date: formattedDate,
                        login: formatTime(new Date(currentRecord.date)),
                        logout: formatTime(new Date(logoutRecord.date)),
                        dayKey: dayKey,
                        originalDate: currentRecord.date
                    });
                    
                    // Skip the logout record we just processed
                    i = dayRecords.indexOf(logoutRecord) + 1;
                } else {
                    // Login without logout
                    tableRows.push({
                        date: formattedDate,
                        login: formatTime(new Date(currentRecord.date)),
                        logout: "—",
                        dayKey: dayKey,
                        originalDate: currentRecord.date
                    });
                    i++;
                }
            } else {
                // Logout without login (shouldn't happen normally)
                tableRows.push({
                    date: formattedDate,
                    login: "—",
                    logout: formatTime(new Date(currentRecord.date)),
                    dayKey: dayKey,
                    originalDate: currentRecord.date
                });
                i++;
            }
        }
    });
    
    return tableRows;
}

/**
 * Display attendance data in table with optional highlighting
 */
function displayAttendanceTable(data) {
    if (!data || data.length === 0) {
        $w("#attendanceTable").rows = [];
        $w("#attendanceTable").hide();
        return;
    }
    
    // Apply highlighting if a specific day is selected
    const processedRows = data.map(row => {
        const tableRow = {
            date: row.date,
            login: row.login,
            logout: row.logout
        };
        
        // Highlight rows for selected day
        if (selectedDay && row.dayKey === selectedDay) {
            // Apply red color to highlight selected day
            tableRow._highlightColor = "#C13939";
        }
        
        return tableRow;
    });
    
    $w("#attendanceTable").rows = processedRows;
    $w("#attendanceTable").show();
    
    // Apply row styling for highlighted rows
    if (selectedDay) {
        setTimeout(() => {
            applyRowHighlighting();
        }, 100);
    }
}

/**
 * Apply custom styling to highlighted rows
 */
function applyRowHighlighting() {
    try {
        // Get table rows and apply styling
        const tableRows = $w("#attendanceTable").rows;
        
        tableRows.forEach((row, index) => {
            if (row._highlightColor) {
                // Apply color styling to row text
                $w("#attendanceTable").rows[index] = {
                    ...row,
                    date: { text: row.date, color: row._highlightColor },
                    login: { text: row.login, color: row._highlightColor },
                    logout: { text: row.logout, color: row._highlightColor }
                };
            }
        });
        
        // Update table display
        $w("#attendanceTable").updateRow(0, tableRows[0]);
        
    } catch (error) {
        console.error("Error applying row highlighting:", error);
    }
}

/**
 * Format date for display
 */
function formatDate(date) {
    const options = { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
    };
    return date.toLocaleDateString('en-US', options);
}

/**
 * Format time for display
 */
function formatTime(date) {
    const options = { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
    };
    return date.toLocaleTimeString('en-US', options);
}

/**
 * Display error message to user
 * Shows message for 5 seconds then auto-hides
 */
function showError(message) {
    $w("#errorText").text = message;
    $w("#errorText").show();
    
    // Hide error after 5 seconds
    setTimeout(() => {
        $w("#errorText").hide();
    }, 5000);
}

/**
 * Get localized loading message based on site language
 */
function getLoadingMessage() {
    const currentLanguage = wixWindow.multilingual?.currentLanguage || 'en';
    
    if (currentLanguage === 'ja') {
        return "出席データを読み込み中...";
    } else {
        return "Loading attendance data...";
    }
}

/**
 * Get localized error messages based on site language
 */
function getLocalizedErrorMessage(errorType) {
    const currentLanguage = wixWindow.multilingual?.currentLanguage || 'en';
    
    const messages = {
        'en': {
            'no_data': 'No attendance data found for this student.',
            'load_failed': 'Failed to load attendance data.',
            'student_list_failed': 'Failed to load student list.',
            'page_load_failed': 'Failed to load page data. Please try again.',
            'selection_failed': 'Failed to load attendance data for selected student.'
        },
        'ja': {
            'no_data': 'この生徒の出席データが見つかりません。',
            'load_failed': '出席データの読み込みに失敗しました。',
            'student_list_failed': '生徒リストの読み込みに失敗しました。',
            'page_load_failed': 'ページデータの読み込みに失敗しました。もう一度お試しください。',
            'selection_failed': '選択された生徒の出席データの読み込みに失敗しました。'
        }
    };
    
    return messages[currentLanguage]?.[errorType] || messages['en'][errorType];
}

/**
 * Enhanced error display with localization support
 */
function showLocalizedError(errorType) {
    const message = getLocalizedErrorMessage(errorType);
    showError(message);
}

/**
 * Update loading text with localized message
 */
function updateLoadingText(messageType = 'loading') {
    const currentLanguage = wixWindow.multilingual?.currentLanguage || 'en';
    
    let message = '';
    if (currentLanguage === 'ja') {
        switch (messageType) {
            case 'loading':
                message = "読み込み中...";
                break;
            case 'loading_data':
                message = "出席データを読み込み中...";
                break;
            case 'updating_birthday':
                message = "誕生日を更新中...";
                break;
            default:
                message = "読み込み中...";
        }
    } else {
        switch (messageType) {
            case 'loading':
                message = "Loading...";
                break;
            case 'loading_data':
                message = "Loading attendance data...";
                break;
            case 'updating_birthday':
                message = "Updating birthday...";
                break;
            default:
                message = "Loading...";
        }
    }
    
    $w("#loadingText").text = message;
}

/**
 * Refresh all student data for currently selected student
 * Useful for manual refresh or after data updates
 */
async function refreshStudentData() {
    if (selectedStudentId && selectedStudentId !== "none") {
        await loadStudentData(selectedStudentId);
    }
}

/**
 * Export function for external use or testing
 * Allows manual refresh of student data
 */
window.refreshStudentData = refreshStudentData;
