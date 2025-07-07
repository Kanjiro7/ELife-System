import wixWindow from 'wix-window';
import wixData from 'wix-data';

let childId = "";
let student = null;
let nextAction = "";
let updateAttendanceFunction = null; // Store the passed function

// Function to close the lightbox with a fade-out effect
function closeLightboxWithFade(result) {
    $w("#confirmLightboxBox").hide("fade", { duration: 300 })
        .then(() => {
            wixWindow.lightbox.close(result);
        });
}

/**
 * Creates JST timestamp in the same format as ESystem
 * Ensures consistency across the application
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

$w.onReady(function () {
    const context = wixWindow.lightbox.getContext();
    
    if (context && context.childId) {
        childId = context.childId;
        updateAttendanceFunction = context.updateAttendanceFunction; // Store the function
        
        console.log("=== LIGHTBOX OPENED ===");
        console.log("Child ID:", childId);
        console.log("Update function available:", !!updateAttendanceFunction);
        
        wixData.query("Students")
            .eq("childId", childId)
            .find()
            .then((results) => {
                if (results.items.length > 0) {
                    student = results.items[0];
                    console.log("Student found:", student.name);
                    
                    let nameSurname = (typeof student.name === "string" && student.name.trim().length > 0) ?
                        student.name.trim() :
                        "Student";
                    
                    let history = student.attendanceHistory || [];
                    let last = history.length > 0 ? history[history.length - 1] : null;

                    let message = "";
                    if (last && last.status === "login") {
                        nextAction = "logout";
                        message = `<span class="txtConfirm">Hey <span style="color:#2A7C6F;font-weight:bold;">${nameSurname}</span><br>Do you want to <span style="color:#DC5A26;font-weight:bold;">LOG OUT</span>?</span>`;
                    } else {
                        nextAction = "login";
                        message = `<span class="txtConfirm">Welcome <span style="color:#2A7C6F;font-weight:bold;">${nameSurname}</span><br>Do you want to <span style="color:#2AAD56;font-weight:bold;">LOG IN</span>?</span>`;
                    }
                    
                    console.log("Next action determined:", nextAction);
                    
                    $w("#txtConfirm").html = message;
                    $w("#btnConfirm").enable();
                } else {
                    console.log("Student not found for childId:", childId);
                    $w("#txtConfirm").html = `<span class="txtConfirm">ID not found!</span>`;
                    $w("#btnConfirm").disable();
                }
            })
            .catch((error) => {
                console.error("Error querying student:", error);
                $w("#txtConfirm").html = `<span class="txtConfirm">Error loading student data!</span>`;
                $w("#btnConfirm").disable();
            });
    } else {
        console.log("No context or childId provided");
        $w("#txtConfirm").html = `<span class="txtConfirm">No ID provided!</span>`;
        $w("#btnConfirm").disable();
    }

    // CORRECTED: Use the passed updateAttendanceFunction or fallback to direct update
    $w("#btnConfirm").onClick(async () => {
        if (!student || !nextAction) {
            console.error("Missing student or nextAction");
            return;
        }

        try {
            console.log("=== CONFIRMING ATTENDANCE ===");
            console.log(`Processing ${nextAction} for student:`, student.name);
            
            // Disable confirm button to prevent double-clicks
            $w("#btnConfirm").disable();
            $w("#btnConfirm").label = "Processing...";

            if (updateAttendanceFunction) {
                // USE THE PASSED FUNCTION (Recommended)
                console.log("Using passed updateAttendanceFunction");
                await updateAttendanceFunction(childId, nextAction);
                console.log("✅ Attendance updated via function with email notification");
            } else {
                // FALLBACK: Direct database update (without email notifications)
                console.log("Fallback: Direct database update");
                let history = student.attendanceHistory || [];
                
                const newRecord = {
                    date: create24HTimestamp(), // Use JST format
                    status: nextAction,
                    type: "user-input" // Mark as manual entry
                };
                
                history.push(newRecord);
                student.attendanceHistory = history;
                
                await wixData.update("Students", student);
                console.log("⚠️ Attendance updated directly (no email notification)");
            }

            // Close with success
            closeLightboxWithFade({ success: true, action: nextAction });

        } catch (error) {
            console.error("❌ Error updating attendance:", error);
            
            // Re-enable button on error
            $w("#btnConfirm").enable();
            $w("#btnConfirm").label = "Confirm";
            
            // Show error message
            $w("#txtConfirm").html = `<span class="txtConfirm" style="color:#E21C21;">Error: ${error.message}</span>`;
        }
    });

    $w("#btnCancel").onClick(() => {
        console.log("Attendance confirmation cancelled");
        closeLightboxWithFade({ success: false });
    });
});
