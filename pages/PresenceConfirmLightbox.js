import wixWindow from 'wix-window';
import wixData from 'wix-data';

let childId = "";
let student = null;
let nextAction = "";

// Function to close the lightbox with a fade-out effect
function closeLightboxWithFade(result) {
    $w("#confirmLightboxBox").hide("fade", { duration: 300 })
        .then(() => {
            wixWindow.lightbox.close(result);
        });
}

$w.onReady(function () {
    const context = wixWindow.lightbox.getContext();
    if (context && context.childId) {
        childId = context.childId;
        wixData.query("Students")
            .eq("childId", childId)
            .find()
            .then((results) => {
                if (results.items.length > 0) {
                    student = results.items[0];
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
                    $w("#txtConfirm").html = message;
                    $w("#btnConfirm").enable();
                } else {
                    $w("#txtConfirm").html = `<span class="txtConfirm">ID not found!</span>`;
                    $w("#btnConfirm").disable();
                }
            });
    } else {
        $w("#txtConfirm").html = `<span class="txtConfirm">No ID provided!</span>`;
        $w("#btnConfirm").disable();
    }

    $w("#btnConfirm").onClick(() => {
        if (!student) return;
        let history = student.attendanceHistory || [];
        history.push({
            date: new Date().toISOString(),
            status: nextAction
        });
        student.attendanceHistory = history;
        wixData.update("Students", student)
            .then(() => {
                closeLightboxWithFade({ success: true, action: nextAction });
            });
    });

    $w("#btnCancel").onClick(() => {
        closeLightboxWithFade({ success: false });
    });
});
