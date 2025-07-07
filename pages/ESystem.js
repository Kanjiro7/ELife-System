import wixWindow from 'wix-window';
import wixData from 'wix-data';
import { sendAttendanceNotification } from 'backend/emailNotifications.web';

let inputId = "";
let isReady = false; // Prevents input until the page is fully ready

/**
 * Creates a robust 24-hour format timestamp string for attendance records
 * Japan Standard Time is UTC+9, format: YYYY-MM-DD HH:MM:SS
 * COMPLETELY REWRITTEN for guaranteed string output
 */
function create24HTimestamp() {
  try {
    // Get current UTC time
    const now = new Date();
    
    // Create JST time by adding 9 hours to UTC
    const utcTime = now.getTime();
    const jstOffset = 9 * 60 * 60 * 1000; // 9 hours in milliseconds
    const jstTime = new Date(utcTime + jstOffset);
    
    // Extract components and ensure they are from the JST date
    const year = jstTime.getUTCFullYear();
    const month = jstTime.getUTCMonth() + 1; // 0-based, so add 1
    const day = jstTime.getUTCDate();
    const hours = jstTime.getUTCHours();
    const minutes = jstTime.getUTCMinutes();
    const seconds = jstTime.getUTCSeconds();
    
    // Format with zero padding and FORCE string return
    const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    const finalTimestamp = `${formattedDate} ${formattedTime}`;
    
    // CRITICAL: Verify it's a string before returning
    if (typeof finalTimestamp !== 'string') {
      throw new Error('Timestamp is not a string!');
    }
    
    console.log(`Created JST timestamp: ${finalTimestamp} (type: ${typeof finalTimestamp})`);
    return finalTimestamp;
    
  } catch (error) {
    console.error('Error creating timestamp:', error);
    // Fallback to manual string construction
    const now = new Date();
    const jst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}:${String(jst.getUTCSeconds()).padStart(2, '0')}`;
  }
}

/**
 * Validates timestamp format to ensure it's correct
 */
function validateTimestamp(timestamp) {
  const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  return typeof timestamp === 'string' && regex.test(timestamp);
}

/**
 * Creates a robust attendance record object with validation
 */
function createAttendanceRecord(status) {
  const timestamp = create24HTimestamp();
  
  // Validate timestamp
  if (!validateTimestamp(timestamp)) {
    throw new Error(`Invalid timestamp format: ${timestamp}`);
  }
  
  // Create record object with explicit field assignment
  const record = {
    date: timestamp,        // MUST be string in YYYY-MM-DD HH:MM:SS format
    status: status,         // login or logout
    type: "user-input"      // ALWAYS include type field
  };
  
  // Final validation
  if (typeof record.date !== 'string') {
    throw new Error('Record date is not a string!');
  }
  
  if (!record.type) {
    throw new Error('Record type is missing!');
  }
  
  console.log('Created attendance record:', record);
  console.log('Record validation:', {
    dateType: typeof record.date,
    dateFormat: validateTimestamp(record.date),
    hasStatus: !!record.status,
    hasType: !!record.type
  });
  
  return record;
}

/**
 * Updates the ID display field and manages action button state
 */
function updateDisplay() {
  $w("#txtIdDisplay").text = inputId.length > 0 ? inputId : "•••";
  if (inputId.length > 0) {
    $w("#btnAction").enable();
  } else {
    $w("#btnAction").disable();
  }
}

/**
 * Handles numeric input from the virtual keypad
 */
function handleInput(num) {
  if (!isReady) return;
  if (inputId.length < 8) {
    inputId += num.toString();
    updateDisplay();
  }
}

/**
 * COMPLETELY REWRITTEN: Updates student attendance with robust data handling
 * Ensures proper string format for dates and includes all required fields
 */
async function updateAttendanceWithNotification(studentId, status) {
  try {
    console.log("=== ROBUST ATTENDANCE UPDATE ===");
    console.log(`Student ID: ${studentId}, Status: ${status}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    // Validate input parameters
    if (!studentId || typeof studentId !== 'string') {
      throw new Error('Invalid student ID provided');
    }
    
    if (!status || !['login', 'logout'].includes(status)) {
      throw new Error('Invalid status provided. Must be login or logout');
    }
    
    // Get current student data from database
    console.log('Querying Students database...');
    const studentResult = await wixData.query("Students")
      .eq("childId", studentId)
      .find();
    
    if (studentResult.items.length === 0) {
      throw new Error(`Student not found with childId: ${studentId}`);
    }
    
    const student = studentResult.items[0];
    console.log(`Student found: ${student.name} (DB ID: ${student._id})`);
    
    // Get existing attendance history or initialize empty array
    let attendanceHistory = [];
    
    if (student.attendanceHistory && Array.isArray(student.attendanceHistory)) {
      attendanceHistory = [...student.attendanceHistory]; // Create copy
      console.log(`Existing attendance records: ${attendanceHistory.length}`);
    } else {
      console.log('No existing attendance history, creating new array');
    }
    
    // Create new attendance record with robust validation
    const newRecord = createAttendanceRecord(status);
    
    // Add new record to history
    attendanceHistory.push(newRecord);
    
    // Prepare updated student object with explicit field assignment
    const updatedStudent = {
      _id: student._id,                    // Required for update
      attendanceHistory: attendanceHistory // Updated history array
    };
    
    // Additional validation before database update
    const lastRecord = attendanceHistory[attendanceHistory.length - 1];
    console.log('Final record validation before DB update:', {
      recordCount: attendanceHistory.length,
      lastRecordDate: lastRecord.date,
      lastRecordType: typeof lastRecord.date,
      lastRecordStatus: lastRecord.status,
      lastRecordTypeField: lastRecord.type
    });
    
    if (typeof lastRecord.date !== 'string') {
      throw new Error('CRITICAL ERROR: Date is not a string before DB update!');
    }
    
    // Update student record in database
    console.log('Updating Students database...');
    const updateResult = await wixData.update("Students", updatedStudent);
    console.log('✅ Database update successful');
    console.log('Update result ID:', updateResult._id);
    
    // Verify the update by querying the record back
    const verificationResult = await wixData.query("Students")
      .eq("_id", student._id)
      .find();
    
    if (verificationResult.items.length > 0) {
      const updatedRecord = verificationResult.items[0];
      const latestAttendance = updatedRecord.attendanceHistory[updatedRecord.attendanceHistory.length - 1];
      console.log('✅ Database verification successful');
      console.log('Latest attendance record in DB:', latestAttendance);
      console.log('Date type in DB:', typeof latestAttendance.date);
    }
    
    // Send email notification to parents (only for user inputs)
    try {
      console.log('=== TRIGGERING EMAIL NOTIFICATION ===');
      console.log(`Calling sendAttendanceNotification(${student._id}, ${status}, false)`);
      
      const emailResult = await sendAttendanceNotification(student._id, status, false);
      console.log('✅ Email notification result:', emailResult);
      
    } catch (emailError) {
      console.error('❌ Email notification failed:', emailError);
      console.error('Email error details:', {
        message: emailError.message,
        stack: emailError.stack
      });
      // Don't fail the attendance update if email fails
    }
    
    console.log('=== ATTENDANCE UPDATE COMPLETED SUCCESSFULLY ===');
    
    return { 
      success: true, 
      action: status,
      timestamp: newRecord.date,
      studentName: student.name
    };
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR in updateAttendanceWithNotification:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      studentId: studentId,
      status: status
    });
    throw error;
  }
}

/**
 * Page initialization and event handler setup
 */
$w.onReady(function () {
  console.log('=== ESYSTEM PAGE INITIALIZATION ===');
  
  // Disable all interactive elements during initialization
  $w("#btnAction").disable();
  for (let i = 0; i <= 9; i++) {
    $w(`#btnNum${i}`).disable();
  }
  $w("#btnBackspace").disable();
  $w("#btnClear").disable();

  // Setup click and touch handlers for number buttons (0-9)
  for (let i = 0; i <= 9; i++) {
    $w(`#btnNum${i}`).onClick(() => handleInput(i));
    
    // Enhanced touch support for mobile
    const $el = $w(`#btnNum${i}`);
    if ($el && $el.$element && $el.$element[0]) {
      $el.$element[0].addEventListener('touchstart', () => handleInput(i), { passive: true });
    }
  }

  // Backspace button
  $w("#btnBackspace").onClick(() => {
    if (!isReady) return;
    inputId = inputId.slice(0, -1);
    updateDisplay();
  });

  // Clear button
  $w("#btnClear").onClick(() => {
    if (!isReady) return;
    inputId = "";
    updateDisplay();
  });

  // Action button with enhanced error handling
  $w("#btnAction").onClick(() => {
    if (!isReady || inputId.length === 0) return;
    
    console.log(`Action button clicked with inputId: ${inputId}`);
    
    // Open confirmation lightbox
    wixWindow.openLightbox("PresenceConfirmLightbox", { 
      childId: inputId,
      updateAttendanceFunction: updateAttendanceWithNotification
    })
      .then((result) => {
        console.log('Lightbox result:', result);
        if (result && result.success) {
          console.log(`✅ Attendance ${result.action} completed successfully for ${result.studentName}`);
          console.log(`Timestamp: ${result.timestamp}`);
        }
        // Reset input field after operation
        inputId = "";
        updateDisplay();
      })
      .catch((error) => {
        console.error('❌ Lightbox operation failed:', error);
        // Reset input field even if operation failed
        inputId = "";
        updateDisplay();
      });
  });

  // Initialize display
  updateDisplay();

  // Enable all interactive elements
  for (let i = 0; i <= 9; i++) {
    $w(`#btnNum${i}`).enable();
  }
  $w("#btnBackspace").enable();
  $w("#btnClear").enable();

  // Show interface with animation
  $w("#loginBox").show("fade", { duration: 300 });
  
  // Mark as ready
  isReady = true;
  console.log('✅ ESystem page initialization completed');
});
