import { Permissions, webMethod } from 'wix-web-module';
import { authorization, badges } from 'wix-members-backend';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

// Constants
const PARENT_ROLE_ID = "0a78d749-4ef6-46f2-8e6c-c5a3e5b273fb";
const PARENT_BADGE_ID = "7a421222-4467-43c9-82b9-9d4d2dd58929";

/**
 * Get all members from Members/FullData for admin dropdown population
 */
export const getAllMembers = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            console.log("=== GETTING ALL MEMBERS ===");
            
            const elevatedQuery = elevate(wixData.query);
            const membersResult = await elevatedQuery("Members/FullData")
                .limit(100)
                .find();

            const formattedMembers = membersResult.items.map(member => ({
                _id: member._id,
                firstName: member.firstName || '',
                lastName: member.lastName || '',
                email: member.loginEmail || member.email || '',
                displayName: `${member.firstName || ''} ${member.lastName || ''}`.trim() || 
                           member.loginEmail || member.email || 'Unknown Member'
            }));

            return {
                success: true,
                members: formattedMembers,
                count: formattedMembers.length
            };

        } catch (error) {
            console.error("Error getting members:", error);
            throw new Error(`Failed to get members: ${error.message}`);
        }
    }
);

/**
 * Check if parent already exists by email and return their data
 */
export const checkExistingParent = webMethod(
    Permissions.SiteMember,
    async (email) => {
        try {
            if (!email) {
                throw new Error("Email is required");
            }

            const result = await wixData.query("Parents")
                .eq("email", email)
                .include("assignedStudents")
                .find();

            if (result.items.length > 0) {
                const parent = result.items[0];
                return {
                    exists: true,
                    parentData: parent
                };
            }

            return { exists: false };

        } catch (error) {
            console.error("Error checking existing parent:", error);
            throw new Error(`Failed to check existing parent: ${error.message}`);
        }
    }
);

/**
 * Get student names by their IDs for display
 */
export const getStudentNamesByIds = webMethod(
    Permissions.SiteMember,
    async (studentIds) => {
        try {
            if (!studentIds || studentIds.length === 0) {
                return { success: true, students: [] };
            }

            const result = await wixData.query("Students")
                .hasSome("_id", studentIds)
                .find();

            const students = result.items.map(student => ({
                _id: student._id,
                name: student.name || 'Unknown Student'
            }));

            return {
                success: true,
                students: students
            };

        } catch (error) {
            console.error("Error getting student names:", error);
            throw new Error(`Failed to get student names: ${error.message}`);
        }
    }
);

/**
 * Create or update parent record with role and badge assignment
 * Uses corrected badges.assignMembers API
 */
export const createOrUpdateParent = webMethod(
    Permissions.SiteMember,
    async (parentData) => {
        try {
            console.log("=== CREATE/UPDATE PARENT ===");
            console.log("Parent data:", parentData);

            const { memberId, email, parentName, relationship, phone, address, assignedStudentIds } = parentData;

            // Validate input data
            if (!memberId || !email || !parentName || !relationship) {
                throw new Error("Missing required fields: memberId, email, parentName, or relationship");
            }

            // Validate relationship
            if (!["Mum", "Dad", "Other"].includes(relationship)) {
                throw new Error("Invalid relationship. Must be Mum, Dad, or Other");
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                throw new Error("Invalid email format");
            }

            // Check if parent already exists
            const existingResult = await wixData.query("Parents")
                .eq("email", email)
                .find();

            const parentRecord = {
                parentName: parentName,
                email: email,
                relationship: relationship,
                phone: phone || '',
                address: address || '',
                memberReference: memberId
            };

            let result;
            let message;
            let isUpdate = false;

            if (existingResult.items.length > 0) {
                // Update existing parent
                const existingParent = existingResult.items[0];
                parentRecord._id = existingParent._id;
                
                result = await wixData.update("Parents", parentRecord);
                message = "Parent updated successfully";
                isUpdate = true;
                console.log("Parent updated");
            } else {
                // Create new parent
                result = await wixData.insert("Parents", parentRecord);
                message = "Parent created successfully";
                console.log("Parent created");
            }

            // Handle student assignments separately
            if (assignedStudentIds && assignedStudentIds.length > 0) {
                try {
                    await wixData.replaceReferences("Parents", result._id, "assignedStudents", assignedStudentIds);
                    console.log("Student assignments updated");
                } catch (studentsError) {
                    console.error("Error updating student assignments:", studentsError);
                }
            } else {
                // Clear all student assignments if none provided
                try {
                    await wixData.removeReference("Parents", result._id, "assignedStudents");
                    console.log("Student assignments cleared");
                } catch (clearError) {
                    console.error("Error clearing student assignments:", clearError);
                }
            }

            // Assign role with elevated permissions
            try {
                const elevatedAssignRole = elevate(authorization.assignRole);
                await elevatedAssignRole(PARENT_ROLE_ID, memberId);
                console.log("Role assigned successfully");
            } catch (roleError) {
                console.error("Role assignment failed:", roleError);
                // Continue execution even if role assignment fails
            }

            // Assign badge using corrected assignMembers API
            try {
                const elevatedAssignMembers = elevate(badges.assignMembers);
                await elevatedAssignMembers(PARENT_BADGE_ID, [memberId]);
                console.log("Badge assigned successfully");
            } catch (badgeError) {
                console.error("Badge assignment failed:", badgeError);
                // Continue execution even if badge assignment fails
            }

            return {
                success: true,
                parentId: result._id,
                message: message,
                isUpdate: isUpdate,
                assignedStudents: assignedStudentIds?.length || 0
            };

        } catch (error) {
            console.error("Error creating/updating parent:", error);
            throw new Error(`Failed to create/update parent: ${error.message}`);
        }
    }
);

/**
 * Remove parent record and associated permissions
 */
export const removeParent = webMethod(
    Permissions.SiteMember,
    async (parentId, memberId) => {
        try {
            console.log("=== REMOVING PARENT ===");
            console.log(`Parent ID: ${parentId}, Member ID: ${memberId}`);

            if (!parentId) {
                throw new Error("Parent ID is required");
            }

            // Get parent data before removal for logging
            const parentData = await wixData.get("Parents", parentId);
            console.log(`Removing parent: ${parentData.parentName}`);

            // Remove parent record
            await wixData.remove("Parents", parentId);
            console.log("Parent record removed");

            // Remove role assignment if memberId provided
            if (memberId) {
                try {
                    const elevatedRemoveRole = elevate(authorization.removeRole);
                    await elevatedRemoveRole(PARENT_ROLE_ID, memberId);
                    console.log("Role removed successfully");
                } catch (roleError) {
                    console.error("Role removal failed:", roleError);
                }

                // Remove badge assignment
                try {
                    const elevatedRemoveMembers = elevate(badges.removeMembers);
                    await elevatedRemoveMembers(PARENT_BADGE_ID, [memberId]);
                    console.log("Badge removed successfully");
                } catch (badgeError) {
                    console.error("Badge removal failed:", badgeError);
                }
            }

            return {
                success: true,
                message: "Parent removed successfully",
                removedParent: parentData.parentName
            };

        } catch (error) {
            console.error("Error removing parent:", error);
            throw new Error(`Failed to remove parent: ${error.message}`);
        }
    }
);

/**
 * Get all parents with their assigned students for admin management
 */
export const getAllParents = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            console.log("=== GETTING ALL PARENTS ===");

            const result = await wixData.query("Parents")
                .include("assignedStudents")
                .ascending("parentName")
                .find();

            const parentsWithStudents = result.items.map(parent => ({
                _id: parent._id,
                parentName: parent.parentName,
                email: parent.email,
                relationship: parent.relationship,
                phone: parent.phone || '',
                address: parent.address || '',
                memberReference: parent.memberReference,
                assignedStudents: parent.assignedStudents || [],
                studentCount: (parent.assignedStudents || []).length,
                createdDate: parent._createdDate,
                updatedDate: parent._updatedDate
            }));

            return {
                success: true,
                parents: parentsWithStudents,
                totalCount: parentsWithStudents.length
            };

        } catch (error) {
            console.error("Error getting all parents:", error);
            throw new Error(`Failed to get parents: ${error.message}`);
        }
    }
);

/**
 * Validate parent-member relationships for system integrity
 */
export const validateParentMemberReferences = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            console.log("=== VALIDATING PARENT-MEMBER REFERENCES ===");

            const elevatedQuery = elevate(wixData.query);
            
            // Get all parents
            const parentsResult = await elevatedQuery("Parents")
                .find();
            
            const validationResults = {
                totalParents: parentsResult.items.length,
                withMemberReference: 0,
                withoutMemberReference: 0,
                invalidReferences: 0,
                validReferences: 0,
                duplicateEmails: 0,
                issues: []
            };

            // Check for duplicate emails
            const emailCounts = {};
            parentsResult.items.forEach(parent => {
                if (parent.email) {
                    emailCounts[parent.email] = (emailCounts[parent.email] || 0) + 1;
                }
            });

            // Identify duplicates
            for (const [email, count] of Object.entries(emailCounts)) {
                if (count > 1) {
                    validationResults.duplicateEmails++;
                    validationResults.issues.push({
                        type: "duplicate_email",
                        email: email,
                        occurrences: count,
                        issue: `Email ${email} is used by ${count} parent records`
                    });
                }
            }
            
            // Validate member references
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
                        validationResults.issues.push({
                            type: "invalid_member_reference",
                            parentId: parent._id,
                            parentName: parent.parentName,
                            issue: "Member reference points to non-existent member",
                            memberReference: parent.memberReference
                        });
                    }
                } else {
                    validationResults.withoutMemberReference++;
                    validationResults.issues.push({
                        type: "missing_member_reference",
                        parentId: parent._id,
                        parentName: parent.parentName,
                        issue: "No member reference assigned",
                        memberReference: null
                    });
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

/**
 * Get parent statistics for admin dashboard
 */
export const getParentStatistics = webMethod(
    Permissions.SiteMember,
    async () => {
        try {
            const elevatedQuery = elevate(wixData.query);
            
            // Get all parents
            const parentsResult = await elevatedQuery("Parents")
                .include("assignedStudents")
                .find();
            
            const stats = {
                totalParents: parentsResult.items.length,
                parentsWithStudents: 0,
                parentsWithoutStudents: 0,
                totalStudentAssignments: 0,
                relationshipBreakdown: {
                    Mum: 0,
                    Dad: 0,
                    Other: 0
                },
                recentlyCreated: 0
            };
            
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            
            parentsResult.items.forEach(parent => {
                // Count student assignments
                const studentCount = (parent.assignedStudents || []).length;
                stats.totalStudentAssignments += studentCount;
                
                if (studentCount > 0) {
                    stats.parentsWithStudents++;
                } else {
                    stats.parentsWithoutStudents++;
                }
                
                // Relationship breakdown
                if (parent.relationship && stats.relationshipBreakdown.hasOwnProperty(parent.relationship)) {
                    stats.relationshipBreakdown[parent.relationship]++;
                }
                
                // Recently created
                if (parent._createdDate && new Date(parent._createdDate) > oneWeekAgo) {
                    stats.recentlyCreated++;
                }
            });
            
            return {
                success: true,
                statistics: stats,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error("Error getting parent statistics:", error);
            throw new Error(`Failed to get statistics: ${error.message}`);
        }
    }
);
