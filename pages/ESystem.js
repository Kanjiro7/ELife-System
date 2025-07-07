import wixWindow from 'wix-window';
import wixData from 'wix-data';
import { sendAttendanceNotification } from 'backend/emailNotifications.web';

let inputId = "";
let isReady = false; // Prevents input until the page is fully ready

/**
 * Creates a 24-hour format timestamp for attendance records
 * Japan Standard Time is UTC+9, format: YYYY-MM-DD HH:MM:SS
 * CORRECTED: Returns string format, not Date object
 */
function create24HTimestamp() {
  const now = new Date();
  
  // Get JST time by using toLocaleString with Tokyo timezone
  const jstTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));
  
  // Format as YYYY-MM-DD HH:MM:SS in 24-hour format
  const year = jstTime.getFullYear();
  const month = String(jstTime.getMonth() + 1).padStart(2, '0');
  const day = String(jstTime.getDate()).padStart(2, '0');
  const hours = String(jstTime.getHours()).padStart(2, '0');
  const minutes = String(jstTime.getMinutes()).padStart(2, '0');
  const seconds = String(jstTime.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Updates the ID display field and manages action button state
 */
function updateDisplay() {
  // Show placeholder when input is empty, otherwise show the entered ID
  $w("#txtIdDisplay").text = inputId.length > 0 ? inputId : "•••";
  if (inputId.length > 0) {
    $w("#btnAction").enable();
  } else {
    $w("#btnAction").disable();
  }
}

/**
 * Handles numeric input from the virtual keypad
 * Only accepts input when the page is fully ready
 */
function handleInput(num) {
  if (!isReady) return;
  if (inputId.length < 8) {
    inputId += num.toString();
    updateDisplay();
  }
}

/**
 * Updates student attendance record with 24-hour timestamp and email notifications
 * Records user input actions and sends notifications to parents
 * CORRECTED: Ensures proper date format and type field
 */
async function updateAttendanceWithNotification(studentId, status) {
  try {
    console.log("=== UPDATING ATTENDANCE WITH CORRECTED TIMESTAMP ===");
    console.log(`Student ID: ${studentId}, Status: ${status}`);
    
    // Get current student data from database
    const studentResult = await wixData.query("Students")
      .eq("childId", studentId)
      .find();
    
    if (studentResult.items.length === 0) {
      throw new Error("Student not found");
    }
    
    const student = studentResult.items[0];
    console.log(`Student found: ${student.name} (DB ID: ${student._id})`);
    
    let history = student.attendanceHistory || [];
    
    // Create JST timestamp string
    const jstTimestamp = create24HTimestamp();
    console.log(`JST Timestamp created: ${jstTimestamp}`);
    
    // Add new attendance record with corrected format
    const newRecord = {
      date: jstTimestamp, // String format: "YYYY-MM-DD HH:MM:SS"
      status: status,
      type: "user-input" // Indicates this is a manual entry from ESystem page
    };
    
    history.push(newRecord);
    console.log("New record to be added:", newRecord);
    
    // Update student record in database
    const updatedStudent = {
      ...student,
      attendanceHistory: history
    };
    
    await wixData.update("Students", updatedStudent);
    console.log("✅ Attendance record updated successfully");
    
    // Send email notification to parents and school (only for user inputs)
    try {
      console.log("=== SENDING EMAIL NOTIFICATION ===");
      await sendAttendanceNotification(student._id, status, false);
      console.log("✅ Email notification sent successfully");
    } catch (emailError) {
      console.error("❌ Failed to send email notification:", emailError);
      // Don't fail the attendance update if email fails
    }
    
    return { success: true, action: status };
    
  } catch (error) {
    console.error("❌ Error updating attendance:", error);
    throw error;
  }
}

/**
 * Page initialization and event handler setup
 */
$w.onReady(function () {
  // Disable all interactive elements during initialization
  $w("#btnAction").disable();
  for (let i = 0; i <= 9; i++) {
    $w(`#btnNum${i}`).disable();
  }
  $w("#btnBackspace").disable();
  $w("#btnClear").disable();

  // Setup click and touch handlers for number buttons (0-9)
  // Touch events provide faster response on mobile devices
  for (let i = 0; i <= 9; i++) {
    $w(`#btnNum${i}`).onClick(() => handleInput(i));
    
    // Add native touchstart for enhanced mobile responsiveness
    const $el = $w(`#btnNum${i}`);
    if ($el && $el.$element && $el.$element[0]) {
      $el.$element[0].addEventListener('touchstart', () => handleInput(i), { passive: true });
    }
  }

  // Backspace button removes the last entered digit
  $w("#btnBackspace").onClick(() => {
    if (!isReady) return;
    inputId = inputId.slice(0, -1);
    updateDisplay();
  });

  // Clear button resets the entire input
  $w("#btnClear").onClick(() => {
    if (!isReady) return;
    inputId = "";
    updateDisplay();
  });

  // Action button opens confirmation lightbox with student data
  $w("#btnAction").onClick(() => {
    if (!isReady || inputId.length === 0) return;
    
    // Open confirmation lightbox with student ID and attendance update function
    wixWindow.openLightbox("PresenceConfirmLightbox", { 
      childId: inputId,
      updateAttendanceFunction: updateAttendanceWithNotification
    })
      .then((result) => {
        if (result && result.success) {
          console.log(`✅ Attendance ${result.action} completed successfully`);
        }
        // Reset input field after operation
        inputId = "";
        updateDisplay();
      })
      .catch((error) => {
        console.error("❌ Error in lightbox operation:", error);
        // Reset input field even if operation failed
        inputId = "";
        updateDisplay();
      });
  });

  // Initialize the display with placeholder dots
  updateDisplay();

  // Enable all interactive elements now that setup is complete
  for (let i = 0; i <= 9; i++) {
    $w(`#btnNum${i}`).enable();
  }
  $w("#btnBackspace").enable();
  $w("#btnClear").enable();

  // Show the login interface with smooth fade animation
  $w("#loginBox").show("fade", { duration: 300 });
  isReady = true;
});
