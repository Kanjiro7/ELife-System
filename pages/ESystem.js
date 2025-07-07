import wixWindow from 'wix-window';
import wixData from 'wix-data';
import { sendAttendanceNotification } from 'backend/emailNotifications.web';

let inputId = "";
let isReady = false; // Prevents input until the page is fully ready

/**
 * Creates a proper JST timestamp for attendance records
 * Japan Standard Time is UTC+9, format: YYYY-MM-DDTHH:MM:SS (no milliseconds, no Z)
 */
function createJSTTimestamp() {
  const now = new Date();
  
  // Add 9 hours to UTC to get JST
  const jstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  
  // Format as YYYY-MM-DDTHH:MM:SS (ISO format without milliseconds and timezone)
  const year = jstTime.getUTCFullYear();
  const month = String(jstTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstTime.getUTCDate()).padStart(2, '0');
  const hours = String(jstTime.getUTCHours()).padStart(2, '0');
  const minutes = String(jstTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(jstTime.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
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
 * Updates student attendance record with JST timestamp and email notifications
 * Records user input actions and sends notifications to parents
 */
async function updateAttendanceWithNotification(studentId, status) {
  try {
    console.log("=== UPDATING ATTENDANCE WITH JST TIMESTAMP ===");
    console.log(`Student childId: ${studentId}, Status: ${status}`);
    
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
    
    // Create JST timestamp in correct format
    const jstTimestamp = createJSTTimestamp();
    console.log(`JST Timestamp created: ${jstTimestamp}`);
    
    // Add new attendance record with correct format
    const attendanceRecord = {
      date: jstTimestamp,           // JST format: YYYY-MM-DDTHH:MM:SS
      status: status,               // login or logout
      type: "user-input"            // Indicates manual entry from ESystem page
    };
    
    history.push(attendanceRecord);
    console.log("New attendance record:", attendanceRecord);
    
    // Update student record in database
    const updatedStudent = {
      ...student,
      attendanceHistory: history
    };
    
    await wixData.update("Students", updatedStudent);
    console.log("✅ Attendance record updated successfully");
    
    // Send email notification to parents (only for user inputs, not system-fix)
    try {
      console.log("=== TRIGGERING EMAIL NOTIFICATION ===");
      await sendAttendanceNotification(student._id, status, false); // false = not system-fix
      console.log("✅ Email notification triggered successfully");
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
