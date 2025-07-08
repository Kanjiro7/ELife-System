import wixWindow from 'wix-window';
import wixData from 'wix-data';

let childId = "";
let student = null;
let nextAction = "";
let updateAttendanceFunction = null; // Store the passed function from parent page

/**
 * Closes the lightbox with a smooth fade-out effect
 * Provides better user experience than immediate close
 */
function closeLightboxWithFade(result) {
    $w("#confirmLightboxBox").hide("fade", { duration: 300 })
        .then(() => {
            wixWindow.lightbox.close(result);
        });
}

/**
 * Creates JST timestamp in the same format as ESystem
 * Ensures consistency across the application for date handling
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
 * Direct database update with proper field preservation
 * Used as fallback when the main update function is not available
 * Preserves all existing student fields while updating only attendance history
 */
async function directAttendanceUpdate(student, nextAction) {
    try {
        console.log("=== FALLBACK: DIRECT DATABASE UPDATE ===");
        
        // Get existing attendance history or initialize empty array
        let history = student.attendanceHistory || [];
        
        // Create new attendance record
        const newRecord = {
            date: create24HTimestamp(), // Use JST format for consistency
            status: nextAction,
            type: "user-input" // Mark as manual entry for tracking purposes
        };
        
        // Add new record to history
        history.push(newRecord);
        
        // CRITICAL: Use complete student object to preserve all existing fields
        // The spread operator (...student) copies ALL existing fields to prevent data loss
        // Only the attendanceHistory field is updated with new data
        const updatedStudent = {
            ...student, // Spread all existing fields to preserve them
            attendanceHistory: history // Update only the attendance history
        };
        
        // Verify all essential student fields are preserved
        if (!updatedStudent.name || !updatedStudent.childId) {
            throw new Error('Essential student fields missing from update object!');
        }
        
        console.log('Preserved student fields in fallback:', {
            name: updatedStudent.name,
            childId: updatedStudent.childId,
            fieldsCount: Object.keys(updatedStudent).length
        });
        
        // Update database with complete object to maintain data integrity
        await wixData.update("Students", updatedStudent);
        console.log("✅ Fallback attendance updated with ALL FIELDS PRESERVED");
        
        return { success: true };
        
    } catch (error) {
        console.error("❌ Error in fallback direct update:", error);
        throw error;
    }
}

/**
 * Lightbox initialization and main functionality
 * Handles student lookup and attendance confirmation with proper element management
 */
$w.onReady(function () {
    console.log("=== PRESENCE CONFIRM LIGHTBOX INITIALIZATION ===");
    
    // CRITICAL: Hide loading element IMMEDIATELY as first operation
    // This prevents the loading element from being visible at lightbox opening
    try {
        if ($w("#loading")) {
            $w("#loading").hide(); // Use .hide() for reliable hiding
            console.log("✅ Loading element hidden at initialization");
        }
    } catch (error) {
        console.error("❌ Error hiding loading element:", error);
    }
    
    const context = wixWindow.lightbox.getContext();
    
    if (context && context.childId) {
        childId = context.childId;
        updateAttendanceFunction = context.updateAttendanceFunction; // Store the function reference
        
        console.log("Child ID:", childId);
        console.log("Update function available:", !!updateAttendanceFunction);
        
        // Query student data from database
        wixData.query("Students")
            .eq("childId", childId)
            .find()
            .then((results) => {
                console.log("Database query completed, results:", results.items.length);
                
                if (results.items.length > 0) {
                    student = results.items[0];
                    console.log("✅ Student found:", student.name);
                    
                    // Get student name with fallback for safety
                    let nameSurname = (typeof student.name === "string" && student.name.trim().length > 0) ?
                        student.name.trim() :
                        "Student";
                    
                    console.log("Student name processed:", nameSurname);
                    
                    // Determine next action based on last attendance record
                    let history = student.attendanceHistory || [];
                    let last = history.length > 0 ? history[history.length - 1] : null;
                    
                    console.log("Attendance history length:", history.length);
                    console.log("Last attendance record:", last);

                    // Create multi-line message format with enhanced spacing and colors
                    let message = "";
                    if (last && last.status === "login") {
                        nextAction = "logout";
                        // Orange color for LOGOUT with styled student name and multi-line format
                        message = `<span class="txtConfirm">Hey </span><br><span style="color:#2A7C6F;font-weight:bold;">${nameSurname}</span><br></span><br>Do you want to </span><br><span style="color:#DC5A26;font-weight:bold;">LOG OUT</span>?</span>`;
                        console.log("🔄 Action determined: LOGOUT");
                    } else {
                        nextAction = "login";
                        // Green color for LOGIN with styled student name and multi-line format
                        message = `<span class="txtConfirm">Welcome </span><br><span style="color:#2A7C6F;font-weight:bold;">${nameSurname}</span><br></span><br>Do you want to </span><br><span style="color:#2AAD56;font-weight:bold;">LOG IN</span>?</span>`;
                        console.log("🔄 Action determined: LOGIN");
                    }
                    
                    console.log("Generated message:", message);
                    
                    // CRITICAL: Update UI with custom message to override editor default
                    try {
                        $w("#txtConfirm").html = message;
                        console.log("✅ Message set in txtConfirm element");
                        
                        // Verify message was set correctly
                        setTimeout(() => {
                            const currentHtml = $w("#txtConfirm").html;
                            console.log("Message verification - current HTML:", currentHtml);
                        }, 100);
                        
                    } catch (error) {
                        console.error("❌ Error setting message:", error);
                        // Fallback to plain text if HTML fails
                        $w("#txtConfirm").text = `${nameSurname} - ${nextAction.toUpperCase()}`;
                    }
                    
                    // Enable confirm button
                    $w("#btnConfirm").enable();
                    console.log("✅ Confirm button enabled");
                    
                } else {
                    console.log("❌ Student not found for childId:", childId);
                    // Error message with consistent styling
                    $w("#txtConfirm").html = `<span class="txtConfirm">ID not found!</span>`;
                    $w("#btnConfirm").disable();
                }
            })
            .catch((error) => {
                console.error("❌ Database query error:", error);
                // Error message with consistent styling
                $w("#txtConfirm").html = `<span class="txtConfirm">Error loading student data!</span>`;
                $w("#btnConfirm").disable();
            });
    } else {
        console.log("❌ No context or childId provided");
        // Error message with consistent styling
        $w("#txtConfirm").html = `<span class="txtConfirm">No ID provided!</span>`;
        $w("#btnConfirm").disable();
    }

    // Confirm button with immediate loading display and proper field preservation
    $w("#btnConfirm").onClick(async () => {
        if (!student || !nextAction) {
            console.error("❌ Missing student or nextAction data");
            return;
        }

        try {
            console.log("=== CONFIRMING ATTENDANCE ===");
            console.log(`Processing ${nextAction} for student: ${student.name}`);
            
            // Disable confirm button to prevent double-clicks
            $w("#btnConfirm").disable();
            console.log("Confirm button disabled");
            
            // CRITICAL: Show loading element IMMEDIATELY
            try {
                if ($w("#loading")) {
                    $w("#loading").show(); // Use .show() for reliable display
                    console.log("✅ Loading element shown");
                }
            } catch (error) {
                console.error("❌ Error showing loading element:", error);
            }

            if (updateAttendanceFunction) {
                // Use the passed function (recommended - includes email notifications)
                console.log("Using passed updateAttendanceFunction");
                await updateAttendanceFunction(childId, nextAction);
                console.log("✅ Attendance updated via main function with email notification");
            } else {
                // Fallback: Direct database update with field preservation
                console.log("Using fallback: Direct database update with field preservation");
                await directAttendanceUpdate(student, nextAction);
                console.log("✅ Attendance updated via fallback (no email notification)");
            }

            // Close lightbox with success result
            closeLightboxWithFade({ 
                success: true, 
                action: nextAction,
                studentName: student.name,
                timestamp: create24HTimestamp()
            });

        } catch (error) {
            console.error("❌ Error updating attendance:", error);
            
            // Re-enable button on error for retry
            $w("#btnConfirm").enable();
            console.log("Confirm button re-enabled due to error");
            
            // CRITICAL: Hide loading element on error
            try {
                if ($w("#loading")) {
                    $w("#loading").hide(); // Use .hide() for reliable hiding
                    console.log("Loading element hidden due to error");
                }
            } catch (hideError) {
                console.error("❌ Error hiding loading element:", hideError);
            }
            
            // Show error message with red color styling
            $w("#txtConfirm").html = `<span class="txtConfirm" style="color:#E21C21;">Error: ${error.message}</span>`;
        }
    });

    // Cancel button functionality
    $w("#btnCancel").onClick(() => {
        console.log("Attendance confirmation cancelled");
        closeLightboxWithFade({ success: false });
    });
    
    console.log("✅ Lightbox initialization completed");
});
