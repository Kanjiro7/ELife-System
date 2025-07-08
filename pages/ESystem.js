import wixWindow from 'wix-window';
import wixData from 'wix-data';
import { sendAttendanceNotification } from 'backend/emailNotifications.web';

let inputId = "";
let isReady = false; // Prevents input until the page is fully ready

/**
 * Creates a robust 24-hour format timestamp string for attendance records
 * Japan Standard Time is UTC+9, format: YYYY-MM-DD HH:MM:SS
 * Ensures guaranteed string output for database consistency
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
 
 // Format with zero padding and ensure string return
 const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
 const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
 
 const finalTimestamp = `${formattedDate} ${formattedTime}`;
 
 // Verify it's a string before returning
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
 * Validates timestamp format to ensure it matches expected pattern
 */
function validateTimestamp(timestamp) {
 const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
 return typeof timestamp === 'string' && regex.test(timestamp);
}

/**
 * Creates a robust attendance record object with validation
 * Ensures all required fields are present and properly typed
 */
function createAttendanceRecord(status) {
 const timestamp = create24HTimestamp();
 
 // Validate timestamp format
 if (!validateTimestamp(timestamp)) {
 throw new Error(`Invalid timestamp format: ${timestamp}`);
 }
 
 // Create record object with explicit field assignment
 const record = {
 date: timestamp, // Must be string in YYYY-MM-DD HH:MM:SS format
 status: status, // login or logout
 type: "user-input" // Always include type field for tracking
 };
 
 // Final validation to ensure data integrity
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
 * Disables page scrolling to prevent vertical movement
 * Essential for kiosk-mode operation on tablets
 */
function disablePageScrolling() {
 try {
 // Disable scroll on document body
 if (typeof document !== 'undefined') {
 document.body.style.overflow = 'hidden';
 document.documentElement.style.overflow = 'hidden';
 
 // Prevent touch scroll events on mobile devices
 document.addEventListener('touchmove', function(e) {
 e.preventDefault();
 }, { passive: false });
 
 // Prevent scroll wheel events
 document.addEventListener('wheel', function(e) {
 e.preventDefault();
 }, { passive: false });
 
 // Prevent keyboard scroll (space, arrow keys)
 document.addEventListener('keydown', function(e) {
 const scrollKeys = [32, 33, 34, 35, 36, 37, 38, 39, 40];
 if (scrollKeys.includes(e.keyCode)) {
 e.preventDefault();
 }
 }, { passive: false });
 
 console.log('✅ Page scrolling disabled successfully');
 }
 } catch (error) {
 console.error('❌ Error disabling page scrolling:', error);
 }
}

/**
 * Updates the ID display field and manages action button state
 * Provides visual feedback to user about current input
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
 * Limits input to maximum 8 characters for student ID
 */
function handleInput(num) {
 if (!isReady) return;
 if (inputId.length < 8) {
 inputId += num.toString();
 updateDisplay();
 }
}

/**
 * Updates student attendance with proper database field preservation
 * This function preserves ALL existing student fields while updating only attendanceHistory
 * Critical for maintaining data integrity in the Students database
 */
async function updateAttendanceWithNotification(studentId, status) {
 try {
 console.log("=== STUDENT ATTENDANCE UPDATE ===");
 console.log(`Student ID: ${studentId}, Status: ${status}`);
 console.log(`Timestamp: ${new Date().toISOString()}`);
 
 // Validate input parameters to ensure data quality
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
 attendanceHistory = [...student.attendanceHistory]; // Create copy to avoid mutations
 console.log(`Existing attendance records: ${attendanceHistory.length}`);
 } else {
 console.log('No existing attendance history, creating new array');
 }
 
 // Create new attendance record with validation
 const newRecord = createAttendanceRecord(status);
 
 // Add new record to history
 attendanceHistory.push(newRecord);
 
 // CRITICAL: Use complete student object to preserve all existing fields
 // The spread operator (...student) copies ALL existing fields to prevent data loss
 // Only the attendanceHistory field is updated with new data
 const updatedStudent = {
 ...student, // Spread all existing fields to preserve them
 attendanceHistory: attendanceHistory // Update only the attendance history
 };
 
 // Additional validation before database update
 const lastRecord = attendanceHistory[attendanceHistory.length - 1];
 console.log('Final record validation before DB update:', {
 recordCount: attendanceHistory.length,
 lastRecordDate: lastRecord.date,
 lastRecordType: typeof lastRecord.date,
 lastRecordStatus: lastRecord.status,
 lastRecordTypeField: lastRecord.type,
 preservedFields: Object.keys(updatedStudent).length
 });
 
 if (typeof lastRecord.date !== 'string') {
 throw new Error('Date is not a string before DB update!');
 }
 
 // Verify all essential student fields are preserved
 if (!updatedStudent.name || !updatedStudent.childId) {
 throw new Error('Essential student fields missing from update object!');
 }
 
 console.log('Preserved student fields:', {
 name: updatedStudent.name,
 childId: updatedStudent.childId,
 fieldsCount: Object.keys(updatedStudent).length
 });
 
 // Update student record in database with complete field preservation
 console.log('Updating Students database with complete object...');
 const updateResult = await wixData.update("Students", updatedStudent);
 console.log('✅ Database update successful - ALL FIELDS PRESERVED');
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
 console.log('Verified preserved fields:', {
 name: updatedRecord.name,
 childId: updatedRecord.childId,
 email: updatedRecord.email || 'N/A',
 totalFields: Object.keys(updatedRecord).length
 });
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
 // Continue execution even if email fails - attendance update is more critical
 }
 
 console.log('=== ATTENDANCE UPDATE COMPLETED SUCCESSFULLY ===');
 
 return { 
 success: true, 
 action: status,
 timestamp: newRecord.date,
 studentName: student.name
 };
 
 } catch (error) {
 console.error('❌ Error in updateAttendanceWithNotification:', error);
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
 * Sets up the virtual keypad, manages page state, and disables page scrolling
 * Optimized for kiosk-mode tablet operation
 */
$w.onReady(function () {
 console.log('=== ESYSTEM PAGE INITIALIZATION ===');
 
 // Disable page scrolling for kiosk-mode operation
 disablePageScrolling();
 
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
 
 // Enhanced touch support for mobile devices
 const $el = $w(`#btnNum${i}`);
 if ($el && $el.$element && $el.$element[0]) {
 $el.$element[0].addEventListener('touchstart', () => handleInput(i), { passive: true });
 }
 }

 // Backspace button functionality for removing last digit
 $w("#btnBackspace").onClick(() => {
 if (!isReady) return;
 inputId = inputId.slice(0, -1);
 updateDisplay();
 });

 // Clear button functionality for resetting input field
 $w("#btnClear").onClick(() => {
 if (!isReady) return;
 inputId = "";
 updateDisplay();
 });

 // Action button with enhanced error handling and lightbox integration
 $w("#btnAction").onClick(() => {
 if (!isReady || inputId.length === 0) return;
 
 console.log(`Action button clicked with inputId: ${inputId}`);
 
 // Open confirmation lightbox with attendance update function
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
 // Reset input field after operation completion
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

 // Initialize display state
 updateDisplay();

 // Enable all interactive elements after setup completion
 for (let i = 0; i <= 9; i++) {
 $w(`#btnNum${i}`).enable();
 }
 $w("#btnBackspace").enable();
 $w("#btnClear").enable();

 // Show interface with smooth animation
 $w("#loginBox").show("fade", { duration: 300 });
 
 // Mark system as ready for user input
 isReady = true;
 console.log('✅ ESystem page initialization completed with scroll blocking');
});
