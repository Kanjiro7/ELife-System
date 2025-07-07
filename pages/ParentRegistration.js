import wixData from 'wix-data';
import wixWindow from 'wix-window';
import { getAllMembers, checkExistingParent, getStudentNamesByIds, createOrUpdateParent } from 'backend/parentAdminManagement.web';

$w.onReady(() => {
    // Initialize variables from existing code
    let selectedChildren = []; // Array of child names
    let selectedChildrenIds = []; // Parallel array of child IDs
    let allMembers = []; // Store all members data
    let currentSelectedMemberId = null; // Currently selected member ID

    // FIXED: Detect page language using wixWindow.multilingual.currentLanguage
    const pageLanguage = wixWindow.multilingual.currentLanguage || "ja"; // Default to Japanese

    // ----------------------------------------------
    // HELPER: Show feedback message
    // ----------------------------------------------
    function showMessage(msg, color = '#E21C21', timeout = 5000) {
        $w('#feedbackMessage').text = msg;
        $w('#feedbackMessage').style.color = color;
        $w('#feedbackMessage').show();
        if (timeout) {
            setTimeout(() => {
                $w('#feedbackMessage').hide();
            }, timeout);
        }
    }

    // ----------------------------------------------
    // HELPER: Validate form to enable submit button
    // ----------------------------------------------
    function validateForm() {
        const memberSelected = $w('#membersDropdown').value;
        const email = $w('#email').value;
        const relation = $w('#relationshipDropdown').value;
        const phone = $w('#phone').value;
        const address = $w('#address').value;
        const hasChild = selectedChildren.length > 0;

        const isValid = memberSelected && email && relation && phone && address && hasChild;
        isValid ? $w('#submitButton').enable() : $w('#submitButton').disable();
    }

    // ----------------------------------------------
    // HELPER: Refresh children list + validate
    // ----------------------------------------------
    function refreshChildrenList() {
        console.log('Selected children list:', selectedChildren);
        const formattedList = selectedChildren.map((name) => `
      <div style='font-family:Futura;font-size:22px;font-weight:bold;color:#2A7C6F;margin-bottom:5px;'>
        • ${name}
      </div>
    `).join('');
        $w('#selectedChildrenText').html = `<div>${formattedList}</div>`;
        validateForm();
    }

    // ----------------------------------------------
    // HELPER: Clear all form fields with proper reset
    // ----------------------------------------------
    function clearForm() {
        $w('#membersDropdown').value = '';
        $w('#email').value = '';
        $w('#phone').value = '';
        $w('#address').value = null;

        // Properly reset dropdown elements
        $w('#relationshipDropdown').value = '';
        $w('#relationshipDropdown').resetValidityIndication();
        $w('#email').resetValidityIndication();

        $w('#childDropdown').value = '';
        selectedChildren = [];
        selectedChildrenIds = [];
        currentSelectedMemberId = null;
        refreshChildrenList();
        validateForm();
    }

    // ----------------------------------------------
    // Load members from Members/FullData with multilingual placeholder
    // ----------------------------------------------
    async function loadMembersDropdown() {
        try {
            // Set appropriate loading message and placeholder based on language
            const loadingMsg = pageLanguage === "ja" ? "メンバーを読み込み中..." : "Loading members...";
            const placeholder = pageLanguage === "ja" ? "会員名" : "Member Name";

            showMessage(loadingMsg, '#000000', 0);

            $w('#membersDropdown').disable();

            // Call backend to get members
            const result = await getAllMembers();

            if (result.success) {
                allMembers = result.members;

                // Create dropdown options with multilingual placeholder
                const dropdownOptions = [
                    { label: placeholder, value: "" }
                ];

                // Sort members by display name
                const sortedMembers = allMembers.sort((a, b) =>
                    a.displayName.localeCompare(b.displayName)
                );

                // Show only names, not emails in dropdown
                sortedMembers.forEach(member => {
                    dropdownOptions.push({
                        label: member.displayName, // Only name, no email
                        value: member._id
                    });
                });

                $w('#membersDropdown').options = dropdownOptions;
                $w('#membersDropdown').enable();

                const successMsg = pageLanguage === "ja" ?
                    `${allMembers.length}人のメンバーを読み込みました` :
                    `Loaded ${allMembers.length} members`;
                showMessage(successMsg, '#2A7C6F', 3000);
            }

        } catch (error) {
            console.error("Error loading members:", error);
            const errorMsg = pageLanguage === "ja" ?
                `メンバーの読み込みに失敗: ${error.message}` :
                `Failed to load members: ${error.message}`;
            showMessage(errorMsg, '#E21C21');
        }
    }

    // ----------------------------------------------
    // Handle member selection with improved data loading
    // ----------------------------------------------
    async function handleMemberSelection() {
        const selectedMemberId = $w('#membersDropdown').value;

        if (!selectedMemberId) {
            // Clear form if no member selected
            $w('#email').value = '';
            $w('#phone').value = '';
            $w('#address').value = null;
            $w('#relationshipDropdown').value = '';
            selectedChildren = [];
            selectedChildrenIds = [];
            refreshChildrenList();
            currentSelectedMemberId = null;
            return;
        }

        // Find selected member data
        const selectedMember = allMembers.find(member => member._id === selectedMemberId);
        if (!selectedMember) return;

        currentSelectedMemberId = selectedMemberId;

        // Populate email from loginEmail
        $w('#email').value = selectedMember.email;

        try {
            const checkingMsg = pageLanguage === "ja" ?
                "既存の保護者データを確認中..." :
                "Checking existing parent data...";
            showMessage(checkingMsg, '#000000', 0);

            // Check if parent already exists
            const existingParent = await checkExistingParent(selectedMember.email);

            if (existingParent.exists) {
                // Populate form with existing data
                const parentData = existingParent.parentData;

                $w('#phone').value = parentData.phone || '';
                if (parentData.address) {
                    $w('#address').value = parentData.address;
                } else {
                    $w('#address').value = null;
                }
                $w('#relationshipDropdown').value = parentData.relationship || '';

                // Load assigned students
                if (parentData.assignedStudents && parentData.assignedStudents.length > 0) {
                    const studentIds = parentData.assignedStudents.map(student => student._id);
                    const studentsResult = await getStudentNamesByIds(studentIds);

                    if (studentsResult.success) {
                        selectedChildren = studentsResult.students.map(student => student.name);
                        selectedChildrenIds = studentsResult.students.map(student => student._id);
                        refreshChildrenList();
                    }
                } else {
                    selectedChildren = [];
                    selectedChildrenIds = [];
                    refreshChildrenList();
                }

                const loadedMsg = pageLanguage === "ja" ?
                    "既存の保護者データを読み込みました" :
                    "Existing parent data loaded";
                showMessage(loadedMsg, '#2A7C6F', 3000);
            } else {
                // Clear form for new parent
                $w('#phone').value = '';
                $w('#address').value = null;
                $w('#relationshipDropdown').value = '';
                selectedChildren = [];
                selectedChildrenIds = [];
                refreshChildrenList();

                const newMsg = pageLanguage === "ja" ?
                    "新しい保護者 - 詳細を入力してください" :
                    "New parent - fill in the details";
                showMessage(newMsg, '#000000', 3000);
            }

        } catch (error) {
            console.error("Error checking existing parent:", error);
            const errorMsg = pageLanguage === "ja" ?
                `保護者データの読み込みエラー: ${error.message}` :
                `Error loading parent data: ${error.message}`;
            showMessage(errorMsg, '#E21C21');
        }

        validateForm();
    }

    // ----------------------------------------------
    // Initialize page
    // ----------------------------------------------
    async function initializePage() {
        // Disable submit button initially
        $w('#submitButton').disable();

        // Load members dropdown
        await loadMembersDropdown();

        // Setup event handlers
        $w('#membersDropdown').onChange(handleMemberSelection);

        // Validate on relevant changes
        ['#email', '#phone', '#address', '#relationshipDropdown'].forEach((selector) => {
            $w(selector).onChange(() => validateForm());
            if ($w(selector).onInput) {
                $w(selector).onInput(() => validateForm());
            }
        });
    }

    // Start initialization
    initializePage();

    // ----------------------------------------------
    // Add Child (existing function adapted)
    // ----------------------------------------------
    $w('#addChildButton').onClick(() => {
        const childName = $w('#childDropdown').value;
        if (!childName) {
            const msg = pageLanguage === "ja" ?
                "学生名を選択してください" :
                "Please select a student name";
            showMessage(msg, '#E21C21');
            return;
        }
        if (selectedChildren.includes(childName)) {
            const msg = pageLanguage === "ja" ?
                "この学生は既にリストに追加されています" :
                "This student is already added to the list";
            showMessage(msg, '#E21C21');
            return;
        }

        // Retrieve child ID from Students database
        wixData.query('Students').eq('name', childName).find()
            .then((res) => {
                if (res.items.length === 0) {
                    const msg = pageLanguage === "ja" ?
                        "データベースに学生が見つかりません" :
                        "Student not found in database";
                    showMessage(msg, '#E21C21');
                    return;
                }
                const studentId = res.items[0]._id;
                selectedChildren.push(childName);
                selectedChildrenIds.push(studentId);
                refreshChildrenList();
                $w('#childDropdown').value = '';
                const msg = pageLanguage === "ja" ?
                    `${childName} をリストに追加しました` :
                    `${childName} added to the list`;
                showMessage(msg, '#2A7C6F', 2000);
            })
            .catch((err) => {
                console.error('Students query error:', err);
                const msg = pageLanguage === "ja" ?
                    "学生データベースの検索エラー" :
                    "Error querying students database";
                showMessage(msg, '#E21C21');
            });
    });

    // ----------------------------------------------
    // Remove last child (existing function)
    // ----------------------------------------------
    $w('#removeName').onClick(() => {
        if (selectedChildren.length === 0) {
            const msg = pageLanguage === "ja" ?
                "リストに削除する名前がありません" :
                "No names in the list to remove";
            showMessage(msg, '#E21C21');
            return;
        }

        const lastChild = selectedChildren.pop();
        selectedChildrenIds.pop();
        refreshChildrenList();
        const msg = pageLanguage === "ja" ?
            `${lastChild} をリストから削除しました` :
            `${lastChild} removed from the list`;
        showMessage(msg, '#2A7C6F', 2000);
    });

    // ----------------------------------------------
    // Submit (improved function with better error handling)
    // ----------------------------------------------
    $w('#submitButton').onClick(async () => {
        if (!currentSelectedMemberId) {
            const msg = pageLanguage === "ja" ?
                "最初にメンバーを選択してください" :
                "Please select a member first";
            showMessage(msg, '#E21C21');
            return;
        }

        const email = $w('#email').value;
        const phone = $w('#phone').value;
        const address = $w('#address').value;
        const relationship = $w('#relationshipDropdown').value;

        if (!email || !phone || !address || !relationship || selectedChildren.length === 0) {
            const msg = pageLanguage === "ja" ?
                "すべてのフィールドを入力し、少なくとも1人の学生を追加してください" :
                "Please fill in all fields and add at least one student";
            showMessage(msg, '#E21C21');
            return;
        }

        // Validate relationship values
        if (!["Mum", "Dad", "Other"].includes(relationship)) {
            const msg = pageLanguage === "ja" ?
                "無効な関係タイプ。Mum、Dad、Otherのいずれかでなければなりません" :
                "Invalid relationship type. Must be Mum, Dad, or Other";
            showMessage(msg, '#E21C21');
            return;
        }

        try {
            // Disable submit button and show loading
            $w('#submitButton').disable();
            const processingMsg = pageLanguage === "ja" ? "処理中..." : "Processing...";
            $w('#submitButton').label = processingMsg;

            const creatingMsg = pageLanguage === "ja" ?
                "保護者レコードを作成/更新中..." :
                "Creating/updating parent record...";
            showMessage(creatingMsg, '#000000', 0);

            // Get member name for parentName
            const selectedMember = allMembers.find(member => member._id === currentSelectedMemberId);
            const parentName = selectedMember ? selectedMember.displayName : 'Unknown';

            // Prepare data for backend
            const parentData = {
                memberId: currentSelectedMemberId,
                email: email,
                parentName: parentName,
                relationship: relationship,
                phone: phone,
                address: address,
                assignedStudentIds: selectedChildrenIds
            };

            // Call backend to create/update parent
            const result = await createOrUpdateParent(parentData);

            if (result.success) {
                const successMsg = pageLanguage === "ja" ?
                    `${result.message} - 役割とバッジが割り当てられました！` :
                    `${result.message} - Role and badge assigned!`;
                showMessage(successMsg, '#2A7C6F', 5000);
                clearForm();
            } else {
                const failMsg = pageLanguage === "ja" ?
                    "保護者レコードの作成/更新に失敗しました" :
                    "Failed to create/update parent record";
                showMessage(failMsg, '#E21C21');
            }

        } catch (error) {
            console.error('Submit error:', error);
            const errorMsg = pageLanguage === "ja" ?
                `エラー: ${error.message}` :
                `Error: ${error.message}`;
            showMessage(errorMsg, '#E21C21');
        } finally {
            $w('#submitButton').enable();
            const submitMsg = pageLanguage === "ja" ? "送信" : "Submit";
            $w('#submitButton').label = submitMsg;
        }
    });
});
