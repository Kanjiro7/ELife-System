import { Permissions, webMethod } from 'wix-web-module';
import { customTrigger } from '@wix/automations';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

// Automation Trigger ID from your Wix Dashboard
const EMAIL_AUTOMATION_TRIGGER_ID = "83665c94-58a9-43c0-b7ee-2ce00875f5cc";

/**
 * Send attendance notification using Wix Automation with payload
 * Automatically filters out system-fix status changes
 * Triggers individual automation for each parent using Member ID as Contact ID
 */
export const sendAttendanceNotification = webMethod(
    Permissions.Anyone,
    async (studentId, status, isSystemFix = false) => {
        try {
            console.log("=== ATTENDANCE NOTIFICATION WITH PAYLOAD ===");
            console.log(`Student: ${studentId}, Status: ${status}, SystemFix: ${isSystemFix}`);
            
            // Skip email for system fixes
            if (isSystemFix) {
                console.log("Skipping email for system fix");
                return { success: true, message: "Email skipped for system fix" };
            }
            
            // Prepare notification data
            const notificationData = await prepareNotificationData(studentId, status);
            
            if (!notificationData || notificationData.parents.length === 0) {
                return { success: true, message: "No parents to notify" };
            }
            
            // Trigger automation for each parent with individual payload
            const automationPromises = [];
            
            for (const parent of notificationData.parents) {
                if (parent.memberReference) {
                    // Create payload for this specific parent
                    const emailPayload = {
                        contactId: parent.memberReference, // Member ID as Contact ID
                        studentName: notificationData.student.name,
                        studentId: notificationData.student._id,
                        parentName: parent.parentName,
                        parentRelationship: parent.relationship || "Parent",
                        status: notificationData.status,
                        statusJapanese: notificationData.status === "login" ? "ログイン" : "ログアウト",
                        timestamp: notificationData.timestamp,
                        schoolName: "ELife International School",
                        triggeredAt: new Date().toISOString()
                    };
                    
                    // Trigger automation with payload for this parent
                    automationPromises.push(
                        triggerParentEmailAutomation(emailPayload, parent.parentName)
                    );
                }
            }
            
            // Execute all automation triggers
            const results = await Promise.allSettled(automationPromises);
            
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            const failCount = results.filter(r => r.status === 'rejected').length;
            
            console.log(`Automation triggers completed: ${successCount} success, ${failCount} failed`);
            
            if (failCount > 0) {
                console.error("Some email automations failed:", 
                    results.filter(r => r.status === 'rejected').map(r => r.reason)
                );
            }
            
            return {
                success: true,
                message: `Triggered ${successCount} email automations`,
                studentName: notificationData.student.name,
                parentCount: notificationData.parents.length,
                successCount: successCount,
                failCount: failCount
            };
            
        } catch (error) {
            console.error("Error in sendAttendanceNotification:", error);
            throw new Error(`Failed to trigger email automation: ${error.message}`);
        }
    }
);

/**
 * Prepare notification data by gathering student and parent information
 */
async function prepareNotificationData(studentId, status) {
    try {
        const elevatedQuery = elevate(wixData.query);
        
        // Get student data
        const studentResult = await elevatedQuery("Students")
            .eq("_id", studentId)
            .find();
        
        if (studentResult.items.length === 0) {
            throw new Error("Student not found");
        }
        
        const student = studentResult.items[0];
        
        // Find parents for this student
        const parentsResult = await elevatedQuery("Parents")
            .contains("assignedStudents", studentId)
            .find();
        
        if (parentsResult.items.length === 0) {
            console.log("No parents found for student");
            return { parents: [] };
        }
        
        // Create JST timestamp for email
        const jstTimestamp = new Date().toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'long'
        });
        
        return {
            student: student,
            parents: parentsResult.items,
            status: status,
            timestamp: jstTimestamp
        };
        
    } catch (error) {
        console.error("Error preparing notification data:", error);
        throw error;
    }
}

/**
 * Trigger email automation for individual parent with payload
 */
async function triggerParentEmailAutomation(payload, parentName) {
    try {
        console.log(`Triggering email automation for parent: ${parentName}`);
        console.log("Payload:", {
            contactId: payload.contactId,
            studentName: payload.studentName,
            parentName: payload.parentName,
            status: payload.status
        });
        
        // Trigger automation with payload - payload is automatically passed to actions
        await customTrigger.runTrigger(EMAIL_AUTOMATION_TRIGGER_ID, payload);
        
        console.log(`✓ Email automation triggered successfully for ${parentName}`);
        
        return { success: true, parentName: parentName };
        
    } catch (error) {
        console.error(`✗ Error triggering automation for ${parentName}:`, error);
        throw new Error(`Failed to trigger automation for ${parentName}: ${error.message}`);
    }
}

/**
 * Test automation with sample payload
 */
export const testEmailAutomation = webMethod(
    Permissions.SiteMember,
    async (testContactId = "00000000-0000-0000-0000-000000000001") => {
        try {
            console.log(`Testing automation trigger: ${EMAIL_AUTOMATION_TRIGGER_ID}`);
            
            const testPayload = {
                contactId: testContactId,
                studentName: "Test Student テスト",
                studentId: "test-student-uuid-1234-5678-9012-345678901234",
                parentName: "Test Parent",
                parentRelationship: "Mum",
                status: "login",
                statusJapanese: "ログイン",
                timestamp: new Date().toLocaleString('ja-JP', { 
                    timeZone: 'Asia/Tokyo',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    weekday: 'long'
                }),
                schoolName: "ELife International School",
                triggeredAt: new Date().toISOString()
            };
            
            // Trigger automation with test payload
            await customTrigger.runTrigger(EMAIL_AUTOMATION_TRIGGER_ID, testPayload);
            
            return {
                success: true,
                message: "Test automation triggered successfully",
                triggerId: EMAIL_AUTOMATION_TRIGGER_ID,
                testPayload: testPayload
            };
            
        } catch (error) {
            console.error("Error testing automation:", error);
            throw new Error(`Test automation failed: ${error.message}`);
        }
    }
);

/**
 * Get automation system status
 */
export const getAutomationStatus = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            const elevatedQuery = elevate(wixData.query);
            
            // Count total parents with memberReference (potential email recipients)
            const totalParents = await elevatedQuery("Parents")
                .isNotEmpty("memberReference")
                .count();
            
            return {
                automationTriggerID: EMAIL_AUTOMATION_TRIGGER_ID,
                status: "active",
                potentialRecipients: totalParents,
                lastUpdated: new Date().toISOString(),
                description: "Email automation for student attendance notifications",
                method: "Payload-based triggering with Contact ID",
                version: "v3.0"
            };
            
        } catch (error) {
            console.error("Error getting automation status:", error);
            return {
                automationTriggerID: EMAIL_AUTOMATION_TRIGGER_ID,
                status: "error",
                error: error.message,
                lastUpdated: new Date().toISOString()
            };
        }
    }
);

/**
 * Validate parent member references for email automation
 * Useful for debugging email delivery issues
 */
export const validateParentMemberReferences = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            const elevatedQuery = elevate(wixData.query);
            
            // Get all parents
            const parentsResult = await elevatedQuery("Parents")
                .find();
            
            const validationResults = {
                totalParents: parentsResult.items.length,
                withMemberReference: 0,
                withoutMemberReference: 0,
                invalidReferences: 0,
                validReferences: 0
            };
            
            for (const parent of parentsResult.items) {
                if (parent.memberReference) {
                    validationResults.withMemberReference++;
                    
                    // Check if member exists
                    const memberResult = await elevatedQuery("Members/FullData")
                        .eq("_id", parent.memberReference)
                        .find();
                    
                    if (memberResult.items.length > 0) {
                        validationResults.validReferences++;
                    } else {
                        validationResults.invalidReferences++;
                        console.warn(`Invalid member reference for parent: ${parent.parentName} (${parent.memberReference})`);
                    }
                } else {
                    validationResults.withoutMemberReference++;
                }
            }
            
            return {
                success: true,
                validation: validationResults,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error("Error validating parent member references:", error);
            throw new Error(`Validation failed: ${error.message}`);
        }
    }
);
