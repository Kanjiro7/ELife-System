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
 * Updates the UI elements with appropriate content based on student status
 * Uses separate text elements to preserve editor styling and manage only status color
 */
function updateUIElements(nameSurname, nextAction) {
    try {
        console.log(`🎨 Updating UI elements for ${nextAction} action`);
        
        // Set greeting text based on action type
        if (nextAction === "logout") {
            $w("#txtGreetings").text = "Hey";
            console.log("Set greeting: Hey (logout)");
        } else {
            $w("#txtGreetings").text = "Welcome";
            console.log("Set greeting: Welcome (login)");
        }
        
        // Set student name (preserves editor styling)
        $w("#txtName").text = nameSurname;
        console.log(`Set student name: ${nameSurname}`);
        
        // Set message text (preserves editor styling)
        $w("#txtMessage").text = "do you want to";
        console.log("Set message: do you want to");
        
        // Set status text with appropriate color
        if (nextAction === "logout") {
            $w("#txtStatus").text = "LOGOUT?";
            $w("#txtStatus").style.color = "#DC5A26"; // Orange color for logout
            console.log("Set status: LOGOUT? (orange color)");
        } else {
            $w("#txtStatus").text = "LOGIN?";
            $w("#txtStatus").style.color = "#2AAD56"; // Green color for login
            console.log("Set status: LOGIN? (green color)");
        }
        
        console.log("✅ All UI elements updated successfully");
        
    } catch (error) {
        console.error("❌ Error updating UI elements:", error);
        // Fallback: Show error in txtGreetings if other elements fail
        try {
            $w("#txtGreetings").text = "Error loading data";
            $w("#txtGreetings").style.color = "#E21C21";
        } catch (fallbackError) {
            console.error("❌ Fallback error display failed:", fallbackError);
        }
    }
}

/**
 * Sets error message across the UI elements
 * Displays error state when student lookup or operations fail
 */
function setErrorMessage(errorText) {
    try {
        console.log(`⚠️ Setting error message: ${errorText}`);
        
        // Clear other elements and show error in greeting
        $w("#txtGreetings").text = errorText;
        $w("#txtGreetings").style.color = "#E21C21"; // Red color for errors
        
        // Clear other text elements
        $w("#txtName").text = "";
        $w("#txtMessage").text = "";
        $w("#txtStatus").text = "";
        
        console.log("✅ Error message set successfully");
        
    } catch (error) {
        console.error("❌ Error setting error message:", error);
    }
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
 * Handles student lookup and attendance confirmation with separate text elements
 * Uses only Wix-compatible APIs for maximum compatibility
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

                    // Determine next action based on last status
                    if (last && last.status === "login") {
                        nextAction = "logout";
                        console.log("🔄 Action determined: LOGOUT");
                    } else {
                        nextAction = "login";
                        console.log("🔄 Action determined: LOGIN");
                    }
                    
                    // Update UI elements with new approach using separate text elements
                    updateUIElements(nameSurname, nextAction);
                    
                    // Enable confirm button
                    $w("#btnConfirm").enable();
                    console.log("✅ Confirm button enabled");
                    
                } else {
                    console.log("❌ Student not found for childId:", childId);
                    // Set error message using new UI approach
                    setErrorMessage("ID not found!");
                    $w("#btnConfirm").disable();
                }
            })
            .catch((error) => {
                console.error("❌ Database query error:", error);
                // Set error message using new UI approach
                setErrorMessage("Error loading student data!");
                $w("#btnConfirm").disable();
            });
    } else {
        console.log("❌ No context or childId provided");
        // Set error message using new UI approach
        setErrorMessage("No ID provided!");
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
            
            // Show error message using new UI approach
            setErrorMessage(`Error: ${error.message}`);
        }
    });

    // Cancel button functionality
    $w("#btnCancel").onClick(() => {
        console.log("Attendance confirmation cancelled");
        closeLightboxWithFade({ success: false });
    });
    
    console.log("✅ Lightbox initialization completed");
});
