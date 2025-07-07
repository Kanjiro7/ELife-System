import wixWindow from 'wix-window';
import { getCurrentParentData, getStudentAttendanceHistory } from 'backend/attendanceManagement.web';

let currentParentData = null;
let selectedStudentId = null;

$w.onReady(async function() {
    // Initialize the page for all site members
    await initializePage();
    
    // Setup event handlers
    $w("#studentSelector").onChange(() => {
        handleStudentSelection();
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
                await loadAttendanceData(selectedStudentId);
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
        
        // If "No student assigned" is selected, clear the table
        if (newSelectedId === "none") {
            $w("#attendanceTable").rows = [];
            $w("#attendanceTable").hide();
            selectedStudentId = null;
            return;
        }
        
        // If a valid student is selected, load their data
        if (newSelectedId && newSelectedId !== selectedStudentId) {
            selectedStudentId = newSelectedId;
            await loadAttendanceData(selectedStudentId);
        }
    } catch (error) {
        console.error("Error handling student selection:", error);
        showError("Failed to load attendance data for selected student.");
    }
}

/**
 * Load and display attendance data for selected student
 * Detects site language and passes it to backend for proper date formatting
 */
async function loadAttendanceData(studentId) {
    try {
        // Show loading state for table
        $w("#attendanceTable").hide();
        $w("#loadingText").text = "Loading attendance data...";
        $w("#loadingText").show();
        
        // Detect current site language for proper date formatting
        const currentLanguage = wixWindow.multilingual?.currentLanguage || 'en';
        console.log("Detected language:", currentLanguage);
        
        // Get attendance history from backend with language parameter
        const result = await getStudentAttendanceHistory(studentId, currentLanguage);
        
        if (result && result.attendanceData) {
            // Backend now handles all formatting, so we can use data directly
            $w("#attendanceTable").rows = result.attendanceData;
            $w("#attendanceTable").show();
            
            console.log(`Loaded ${result.attendanceData.length} attendance records for ${result.studentName}`);
        } else {
            // No data found, show empty table
            $w("#attendanceTable").rows = [];
            showError("No attendance data found for this student.");
        }
        
        $w("#loadingText").hide();
        
    } catch (error) {
        console.error("Error loading attendance data:", error);
        showError("Failed to load attendance data.");
        $w("#loadingText").hide();
    }
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
 * Refresh attendance data for currently selected student
 * Useful for manual refresh or after data updates
 */
async function refreshAttendanceData() {
    if (selectedStudentId && selectedStudentId !== "none") {
        await loadAttendanceData(selectedStudentId);
    }
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
            default:
                message = "Loading...";
        }
    }
    
    $w("#loadingText").text = message;
}

// Enhanced version of loadAttendanceData with better localization
async function loadAttendanceDataEnhanced(studentId) {
    try {
        // Show loading state with localized message
        $w("#attendanceTable").hide();
        updateLoadingText('loading_data');
        $w("#loadingText").show();
        
        // Detect current site language
        const currentLanguage = wixWindow.multilingual?.currentLanguage || 'en';
        
        // Get attendance history from backend
        const result = await getStudentAttendanceHistory(studentId, currentLanguage);
        
        if (result && result.attendanceData && result.attendanceData.length > 0) {
            // Display data in table
            $w("#attendanceTable").rows = result.attendanceData;
            $w("#attendanceTable").show();
            
            console.log(`Loaded ${result.attendanceData.length} attendance records for ${result.studentName}`);
        } else {
            // No data found
            $w("#attendanceTable").rows = [];
            showLocalizedError('no_data');
        }
        
        $w("#loadingText").hide();
        
    } catch (error) {
        console.error("Error loading attendance data:", error);
        showLocalizedError('load_failed');
        $w("#loadingText").hide();
    }
}

/**
 * Export function for external use or testing
 * Allows manual refresh of attendance data
 */
window.refreshAttendance = refreshAttendanceData;

/**
 * Initialize enhanced error handling and localization
 * This version can be used instead of the basic functions above
 */
async function initializePageEnhanced() {
    try {
        // Show loading with localized message
        updateLoadingText('loading');
        $w("#loadingText").show();
        $w("#studentSelector").disable();
        $w("#attendanceTable").hide();
        
        // Get current parent data
        currentParentData = await getCurrentParentData();
        
        // Populate student selector
        await populateStudentSelector();
        
        // Hide loading
        $w("#loadingText").hide();
        
    } catch (error) {
        console.error("Error initializing page:", error);
        showLocalizedError('page_load_failed');
        $w("#loadingText").hide();
    }
}
