import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

/**
 * Synchronize parent emails with member emails weekly on Sunday at 22:30 JST
 * Updates the email field in Parents collection if different from Members/FullData
 * Scheduled to run weekly on Sunday at 13:30 UTC (22:30 JST)
 */
export const syncParentEmailsWeekly = webMethod(
    Permissions.Anyone,
    async () => {
        try {
            console.log("=== SYNCING PARENT EMAILS WEEKLY ===");
            
            const elevatedQuery = elevate(wixData.query);
            const elevatedUpdate = elevate(wixData.update);
            
            // Get all parents with memberReference
            const parentsResult = await elevatedQuery("Parents")
                .isNotEmpty("memberReference")
                .find();
            
            let updatedCount = 0;
            let processedCount = 0;
            let errorCount = 0;
            
            for (const parent of parentsResult.items) {
                processedCount++;
                
                try {
                    // Get member email from Members/FullData
                    const memberResult = await elevatedQuery("Members/FullData")
                        .eq("_id", parent.memberReference)
                        .find();
                    
                    if (memberResult.items.length === 0) {
                        console.log(`Member not found for parent: ${parent.parentName || 'Unknown'}`);
                        errorCount++;
                        continue;
                    }
                    
                    const memberEmail = memberResult.items[0].loginEmail;
                    
                    // Update parent email if different
                    if (parent.email !== memberEmail && memberEmail) {
                        await elevatedUpdate("Parents", {
                            _id: parent._id,
                            email: memberEmail,
                            emailSyncedAt: new Date().toISOString(),
                            previousEmail: parent.email,
                            syncType: "weekly-auto"
                        });
                        
                        updatedCount++;
                        console.log(`Updated email for parent: ${parent.parentName || 'Unknown'} from ${parent.email} to ${memberEmail}`);
                    }
                    
                } catch (innerError) {
                    console.error(`Error updating parent ${parent.parentName || 'Unknown'}:`, innerError);
                    errorCount++;
                }
            }
            
            console.log(`Weekly email synchronization completed. Processed: ${processedCount}, Updated: ${updatedCount}, Errors: ${errorCount}`);
            
            return { 
                success: true, 
                processedCount: processedCount,
                updatedCount: updatedCount,
                errorCount: errorCount,
                syncDate: new Date().toISOString(),
                syncType: "weekly"
            };
            
        } catch (error) {
            console.error("Error in syncParentEmailsWeekly:", error);
            throw new Error(`Failed to sync parent emails: ${error.message}`);
        }
    }
);

/**
 * Manual trigger for email synchronization (for testing or emergency sync)
 */
export const manualSyncParentEmails = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            console.log("=== MANUAL TRIGGER: SYNCING PARENT EMAILS ===");
            
            // Call weekly sync function but mark as manual
            const result = await syncParentEmailsWeekly();
            
            // Update sync type to manual for tracking
            if (result.success && result.updatedCount > 0) {
                const elevatedQuery = elevate(wixData.query);
                const elevatedUpdate = elevate(wixData.update);
                
                // Mark recently synced parents as manual sync
                const recentlySynced = await elevatedQuery("Parents")
                    .isNotEmpty("emailSyncedAt")
                    .gt("emailSyncedAt", new Date(Date.now() - 60000).toISOString()) // Last minute
                    .find();
                
                for (const parent of recentlySynced.items) {
                    await elevatedUpdate("Parents", {
                        _id: parent._id,
                        syncType: "manual"
                    });
                }
            }
            
            return {
                ...result,
                syncType: "manual",
                triggeredBy: "administrator"
            };
            
        } catch (error) {
            console.error("Error in manual sync:", error);
            throw error;
        }
    }
);

/**
 * Get sync statistics for monitoring
 */
export const getEmailSyncStats = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            const elevatedQuery = elevate(wixData.query);
            
            // Count total parents with memberReference
            const totalParents = await elevatedQuery("Parents")
                .isNotEmpty("memberReference")
                .count();
            
            // Count recently synced parents (last 7 days for weekly check)
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);
            
            const recentlySynced = await elevatedQuery("Parents")
                .isNotEmpty("emailSyncedAt")
                .gt("emailSyncedAt", lastWeek.toISOString())
                .count();
            
            // Count by sync type
            const weeklyAutoSynced = await elevatedQuery("Parents")
                .eq("syncType", "weekly-auto")
                .gt("emailSyncedAt", lastWeek.toISOString())
                .count();
            
            const manualSynced = await elevatedQuery("Parents")
                .eq("syncType", "manual")
                .gt("emailSyncedAt", lastWeek.toISOString())
                .count();
            
            // Find last sync date
            const lastSyncResult = await elevatedQuery("Parents")
                .isNotEmpty("emailSyncedAt")
                .descending("emailSyncedAt")
                .limit(1)
                .find();
            
            const lastSyncDate = lastSyncResult.items.length > 0 ? 
                lastSyncResult.items[0].emailSyncedAt : null;
            
            return {
                success: true,
                totalParentsWithMembers: totalParents,
                recentlySynced: recentlySynced,
                weeklyAutoSynced: weeklyAutoSynced,
                manualSynced: manualSynced,
                lastSyncDate: lastSyncDate,
                syncFrequency: "Weekly (Sundays at 22:30 JST)",
                lastCheckTime: new Date().toISOString()
            };
            
        } catch (error) {
            console.error("Error getting sync stats:", error);
            throw new Error(`Failed to get sync statistics: ${error.message}`);
        }
    }
);

/**
 * Check for email mismatches without updating (read-only check)
 */
export const checkEmailMismatches = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            console.log("=== CHECKING EMAIL MISMATCHES (READ-ONLY) ===");
            
            const elevatedQuery = elevate(wixData.query);
            
            // Get all parents with memberReference
            const parentsResult = await elevatedQuery("Parents")
                .isNotEmpty("memberReference")
                .find();
            
            const mismatches = [];
            let processedCount = 0;
            
            for (const parent of parentsResult.items) {
                processedCount++;
                
                try {
                    // Get member email from Members/FullData
                    const memberResult = await elevatedQuery("Members/FullData")
                        .eq("_id", parent.memberReference)
                        .find();
                    
                    if (memberResult.items.length === 0) {
                        mismatches.push({
                            parentName: parent.parentName,
                            parentEmail: parent.email,
                            memberEmail: "MEMBER_NOT_FOUND",
                            memberReference: parent.memberReference,
                            issue: "Member not found"
                        });
                        continue;
                    }
                    
                    const memberEmail = memberResult.items[0].loginEmail;
                    
                    // Check for mismatch
                    if (parent.email !== memberEmail && memberEmail) {
                        mismatches.push({
                            parentName: parent.parentName,
                            parentEmail: parent.email,
                            memberEmail: memberEmail,
                            memberReference: parent.memberReference,
                            issue: "Email mismatch"
                        });
                    }
                    
                } catch (innerError) {
                    console.error(`Error checking parent ${parent.parentName || 'Unknown'}:`, innerError);
                    mismatches.push({
                        parentName: parent.parentName,
                        parentEmail: parent.email,
                        memberEmail: "ERROR",
                        memberReference: parent.memberReference,
                        issue: innerError.message
                    });
                }
            }
            
            console.log(`Email mismatch check completed. Processed: ${processedCount}, Mismatches found: ${mismatches.length}`);
            
            return {
                success: true,
                processedCount: processedCount,
                mismatchCount: mismatches.length,
                mismatches: mismatches,
                checkDate: new Date().toISOString()
            };
            
        } catch (error) {
            console.error("Error checking email mismatches:", error);
            throw new Error(`Failed to check email mismatches: ${error.message}`);
        }
    }
);
