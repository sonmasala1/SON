// Staff/owner interface copy shares the public language preference, without sharing authentication.
const entries = `
MFA ENROLLMENT COMPLETE	बहु-कारक सत्यापन का पंजीकरण पूरा
Save your recovery codes.	अपने रिकवरी कोड सहेजें।
Each code works once with your password if your authenticator is unavailable. Store these offline. They will not be shown again.	प्रमाणक उपलब्ध न होने पर हर कोड पासवर्ड के साथ एक बार काम करेगा। इन्हें ऑफ़लाइन सुरक्षित रखें। ये दोबारा नहीं दिखेंगे।
I saved my recovery codes	मैंने अपने रिकवरी कोड सहेज लिए हैं
OWNER-APPROVED STAFF ACCESS	मालिक द्वारा स्वीकृत कर्मचारी पहुँच
Accept your invitation	अपना आमंत्रण स्वीकार करें
Verify your email, choose your own password, and enroll an authenticator before administration access is activated.	प्रशासनिक पहुँच सक्रिय होने से पहले ईमेल सत्यापित करें, अपना पासवर्ड चुनें और प्रमाणक जोड़ें।
Your invitation link is held only in memory for this enrollment.	इस पंजीकरण के दौरान आमंत्रण लिंक केवल अस्थायी मेमोरी में रहता है।
Verify invitation & send email code	आमंत्रण जाँचें और ईमेल कोड भेजें
Open the complete invitation link provided by the owner.	मालिक से मिला पूरा आमंत्रण लिंक खोलें।
Development email preview · no email sent	परीक्षण ईमेल पूर्वावलोकन · कोई ईमेल नहीं भेजा गया
Preview code:	पूर्वावलोकन कोड:
Email verification code	ईमेल सत्यापन कोड
Verify Email	ईमेल सत्यापित करें
Choose a secure password	सुरक्षित पासवर्ड चुनें
Use 12 or more characters. Your password is never sent by email.	कम से कम 12 अक्षर रखें। आपका पासवर्ड ईमेल से कभी नहीं भेजा जाता।
Continue to MFA Enrollment	बहु-कारक सत्यापन पंजीकरण पर जाएँ
Admin ID:	प्रशासक आईडी:
Set up your authenticator	अपना प्रमाणक सेट करें
Add a time-based account in your authenticator app using this setup key:	इस सेटअप कुंजी से प्रमाणक ऐप में समय आधारित खाता जोड़ें:
Authenticator enrollment URI	प्रमाणक पंजीकरण यूआरआई
Authenticator verification code	प्रमाणक सत्यापन कोड
Verify MFA & Activate	सत्यापित करके सक्रिय करें
Owner	मालिक
Staff	कर्मचारी
OWNER-ONLY ACCESS CONTROL	केवल मालिक के लिए पहुँच नियंत्रण
Staff access management	कर्मचारियों की पहुँच का प्रबंधन
Invite administrator	प्रशासक को आमंत्रित करें
Only the owner can grant access, change permissions, or revoke staff sessions.	केवल मालिक पहुँच दे सकता है, अनुमतियाँ बदल सकता है या कर्मचारियों के सत्र रद्द कर सकता है।
Loading staff access…	कर्मचारियों की पहुँच लोड हो रही है…
Active admins	सक्रिय प्रशासक
Suspended admins	निलंबित प्रशासक
Pending invitations	लंबित आमंत्रण
Edit access for	पहुँच बदलें:
Saving permission changes immediately revokes this administrator’s existing sessions.	अनुमतियाँ सहेजते ही इस प्रशासक के मौजूदा सत्र रद्द हो जाएँगे।
Assigned role	सौंपी गई भूमिका
Save Permissions	अनुमतियाँ सहेजें
Cancel	रद्द करें
Admin ID / name	प्रशासक आईडी / नाम
Verified email / contact	सत्यापित ईमेल / संपर्क
Role / permissions	भूमिका / अनुमतियाँ
Status	स्थिति
Last login / created	अंतिम लॉग इन / बनाया गया
Actions	कार्रवाइयाँ
Email verified	ईमेल सत्यापित
Development preview · email not verified	परीक्षण पूर्वावलोकन · ईमेल सत्यापित नहीं
Verification pending	सत्यापन लंबित
Never	कभी नहीं
Created	बनाया गया
Edit permissions	अनुमतियाँ बदलें
ACTIVE	सक्रिय
SUSPENDED	निलंबित
Suspend	निलंबित करें
Reactivate	दोबारा सक्रिय करें
REVOKED	पहुँच रद्द
Revoke access	पहुँच रद्द करें
Terminate sessions	सत्र समाप्त करें
View history	इतिहास देखें
Reinvite	दोबारा आमंत्रित करें
No administrators have been invited.	अभी कोई प्रशासक आमंत्रित नहीं किया गया है।
Recent staff login activity	कर्मचारियों की हाल की लॉग इन गतिविधि
No staff login activity yet.	अभी कोई कर्मचारी लॉग इन गतिविधि नहीं है।
Recent access changes	हाल के पहुँच बदलाव
No access changes yet.	अभी कोई पहुँच बदलाव नहीं है।
OWNER-ONLY · APPEND-ONLY AUDIT HISTORY	केवल मालिक · अपरिवर्तनीय ऑडिट इतिहास
Staff access history	कर्मचारी पहुँच का इतिहास
Refresh	ताज़ा करें
Filtered target:	चुना हुआ लक्ष्य:
Loading audit events…	ऑडिट घटनाएँ लोड हो रही हैं…
Time	समय
Action / result	कार्रवाई / परिणाम
Actor / target	कर्ता / लक्ष्य
Changes / session metadata	बदलाव / सत्र की जानकारी
Unauthenticated attempt	बिना प्रमाणीकरण का प्रयास
No audit events match this view.	इस चयन के लिए कोई ऑडिट घटना नहीं मिली।
Total orders	कुल ऑर्डर
Paid orders	भुगतान किए गए ऑर्डर
Pending orders	लंबित ऑर्डर
Collected payments	प्राप्त भुगतान
Refunds	वापसी भुगतान
Net collected	शुद्ध प्राप्त राशि
Products sold	बेचे गए उत्पाद
Available inventory units	उपलब्ध स्टॉक इकाइयाँ
Low-stock packs	कम स्टॉक वाले पैक
Published products	प्रकाशित उत्पाद
Customer accounts	ग्राहक खाते
OWNER	मालिक
THE COMPLETE BUSINESS VIEW	व्यवसाय का पूरा विवरण
YOUR AUTHORIZED BUSINESS VIEW	आपके अधिकृत व्यवसाय का विवरण
Business dashboard	व्यवसाय डैशबोर्ड
Refresh data	जानकारी ताज़ा करें
Actual sales and payment totals exclude all demo transactions.	वास्तविक बिक्री और भुगतान की कुल राशि में नमूना लेन-देन शामिल नहीं हैं।
Loading authorized business data…	अधिकृत व्यवसाय जानकारी लोड हो रही है…
Separate test activity:	अलग परीक्षण गतिविधि:
demo orders. These are excluded from sales totals.	नमूना ऑर्डर। इन्हें बिक्री की कुल राशि में शामिल नहीं किया जाता।
Product-wise units sold	उत्पाद के अनुसार बिक्री इकाइयाँ
Product	उत्पाद
Units	इकाइयाँ
Sales	बिक्री
No actual paid product sales yet.	अभी कोई वास्तविक भुगतान वाली उत्पाद बिक्री नहीं है।
Category-wise sales	श्रेणी के अनुसार बिक्री
No actual paid category sales yet.	अभी कोई वास्तविक भुगतान वाली श्रेणी बिक्री नहीं है।
Loading authorized records…	अधिकृत रिकॉर्ड लोड हो रहे हैं…
No records are available.	कोई रिकॉर्ड उपलब्ध नहीं है।
Record	रिकॉर्ड
Details	विवरण
Status / amount	स्थिति / राशि
Update	बदलें
NEW	नया
PROCESSING	प्रक्रिया में
PACKED	पैक किया गया
OWNER-APPROVED INVITATION	मालिक द्वारा स्वीकृत आमंत्रण
Development invitation prepared.	परीक्षण आमंत्रण तैयार है।
Invitation sent.	आमंत्रण भेजा गया।
Access stays inactive until email verification, password setup, and MFA enrollment are completed.	ईमेल सत्यापन, पासवर्ड सेटअप और बहु-कारक पंजीकरण पूरा होने तक पहुँच निष्क्रिय रहती है।
Development preview only — no email was sent.	केवल परीक्षण पूर्वावलोकन — कोई ईमेल नहीं भेजा गया।
Use this single-use invitation in your local test environment. It still requires the email-code and MFA enrollment steps.	यह एक बार उपयोग होने वाला आमंत्रण स्थानीय परीक्षण में इस्तेमाल करें। ईमेल कोड और बहु-कारक पंजीकरण फिर भी ज़रूरी हैं।
Development invitation link	परीक्षण आमंत्रण लिंक
Open development invitation	परीक्षण आमंत्रण खोलें
Back to staff access	कर्मचारी पहुँच पर वापस जाएँ
GRANT ACCESS WITH AN INVITATION	आमंत्रण से पहुँच दें
Invite an administrator	प्रशासक को आमंत्रित करें
Choose the operational role and permissions. A single-use invitation expires after 48 hours. No password is sent by email.	काम की भूमिका और अनुमतियाँ चुनें। एक बार उपयोग होने वाला आमंत्रण 48 घंटे बाद समाप्त होता है। ईमेल से पासवर्ड नहीं भेजा जाता।
Loading roles…	भूमिकाएँ लोड हो रही हैं…
Assigned Role	सौंपी गई भूमिका
Allowed permissions	स्वीकृत अनुमतियाँ
Staff-access and owner-security permissions cannot be assigned to ordinary administrators.	कर्मचारी पहुँच और मालिक की सुरक्षा की अनुमतियाँ साधारण प्रशासकों को नहीं दी जा सकतीं।
Preparing invitation…	आमंत्रण तैयार हो रहा है…
Send Admin Invitation	प्रशासक आमंत्रण भेजें
Passkey added. You can now use phishing-resistant owner sign-in.	पासकी जुड़ गई। अब आप फ़िशिंग से सुरक्षित मालिक लॉग इन कर सकते हैं।
Passkey enrollment was cancelled.	पासकी पंजीकरण रद्द हुआ।
Other owner sessions have been revoked.	मालिक के अन्य सत्र रद्द कर दिए गए हैं।
OWNER-ONLY SECURITY CONTROLS	केवल मालिक के सुरक्षा नियंत्रण
Protect your owner account	अपने मालिक खाते को सुरक्षित रखें
Add a passkey with device verification for phishing-resistant sign-in. Keep your offline recovery codes in a secure place.	सुरक्षित लॉग इन के लिए डिवाइस सत्यापन वाली पासकी जोड़ें। ऑफ़लाइन रिकवरी कोड सुरक्षित रखें।
Add a passkey	पासकी जोड़ें
Use a fresh authenticator code. A code already used for sign-in cannot be reused.	प्रमाणक का नया कोड भरें। लॉग इन में उपयोग किया गया कोड दोबारा नहीं चलेगा।
Authenticator code	प्रमाणक कोड
Add Owner Passkey	मालिक की पासकी जोड़ें
Registered passkeys (	पंजीकृत पासकी (
Registered	पंजीकृत
Active owner sessions	मालिक के सक्रिय सत्र
Revoke other sessions	अन्य सत्र रद्द करें
Session	सत्र
Session:	सत्र:
MFA	बहु-कारक सत्यापन
Last seen	आखिरी गतिविधि
Expires	समाप्ति
Current session	मौजूदा सत्र
Enter your Owner ID first.	पहले अपनी मालिक आईडी भरें।
Passkey sign-in was cancelled. Please try again.	पासकी लॉग इन रद्द हुआ। फिर से प्रयास करें।
SON MASALA · SECURE ACCESS	सोन मसाला · सुरक्षित पहुँच
One owner.	एक मालिक।
Clear accountability.	स्पष्ट जवाबदेही।
Your workspace.	आपका कार्यक्षेत्र।
Your responsibilities.	आपकी ज़िम्मेदारियाँ।
Manage staff access, review security activity, and oversee the business from your private owner console.	निजी मालिक कंसोल से कर्मचारियों की पहुँच सँभालें, सुरक्षा गतिविधि देखें और व्यवसाय की निगरानी करें।
Access the business tools assigned to your staff account. Every administrative action is checked by the server.	अपने कर्मचारी खाते को मिले व्यावसायिक उपकरण उपयोग करें। हर प्रशासनिक कार्रवाई सर्वर पर जाँची जाती है।
SUPER ADMIN / OWNER	मुख्य प्रशासक / मालिक
AUTHORIZED STAFF ONLY	केवल अधिकृत कर्मचारी
Owner sign-in	मालिक लॉग इन
Admin sign-in	प्रशासक लॉग इन
Use your server-issued ID, password, and authenticator code.	सर्वर से मिली आईडी, पासवर्ड और प्रमाणक कोड भरें।
Owner ID	मालिक आईडी
Admin ID	प्रशासक आईडी
Password	पासवर्ड
MFA verification code	बहु-कारक सत्यापन कोड
Authenticator or unused recovery code	प्रमाणक कोड या अप्रयुक्त रिकवरी कोड
Verifying secure access…	सुरक्षित पहुँच का सत्यापन हो रहा है…
Sign in as Owner	मालिक के रूप में लॉग इन करें
Sign in as Admin	प्रशासक के रूप में लॉग इन करें
Sign in with a passkey	पासकी से लॉग इन करें
Initial owner setup and emergency recovery require the protected deployment CLI. There is no public owner registration.	मालिक का शुरुआती सेटअप और आपातकालीन रिकवरी सुरक्षित कमांड लाइन से होती है। मालिक का सार्वजनिक पंजीकरण नहीं है।
Administrator accounts require an owner-approved invitation and completed MFA enrollment. Public registration is unavailable.	प्रशासक खाते के लिए मालिक की मंज़ूरी वाला आमंत्रण और पूरा बहु-कारक पंजीकरण ज़रूरी है। सार्वजनिक पंजीकरण उपलब्ध नहीं है।
Your account is not authorized to access this area.	आपके खाते को इस क्षेत्र की अनुमति नहीं है।
Access denied	पहुँच अस्वीकृत
Go to	यहाँ जाएँ:
Checking secure staff access…	सुरक्षित कर्मचारी पहुँच जाँची जा रही है…
Permission required	अनुमति ज़रूरी है
Your account does not have access to this module.	आपके खाते को इस भाग की अनुमति नहीं है।
Back to dashboard	डैशबोर्ड पर वापस जाएँ
Dashboard	डैशबोर्ड
Orders	ऑर्डर
Products	उत्पाद
Inventory	स्टॉक
Customers	ग्राहक
Payments	भुगतान
Analytics	विश्लेषण
Shipping	शिपिंग
Staff access	कर्मचारी पहुँच
Audit history	ऑडिट इतिहास
Owner security	मालिक की सुरक्षा
OWNER CONSOLE	मालिक कंसोल
Administration navigation	प्रशासनिक नेविगेशन
Sign out of	यहाँ से लॉग आउट करें:
ADMINISTRATION	प्रशासन
ADMIN	प्रशासक
Administrator	प्रशासक
Super Admin / Owner	मुख्य प्रशासक / मालिक
Order manager	ऑर्डर प्रबंधक
Inventory manager	स्टॉक प्रबंधक
Sales manager	बिक्री प्रबंधक
Support manager	सहायता प्रबंधक
ORDER_MANAGER	ऑर्डर प्रबंधक
INVENTORY_MANAGER	स्टॉक प्रबंधक
SALES_MANAGER	बिक्री प्रबंधक
SUPPORT_MANAGER	सहायता प्रबंधक
Reviews	समीक्षाएँ
permissions	अनुमतियाँ
SUCCESS	सफल
DENIED	अस्वीकृत
LOGIN	लॉग इन
LOGOUT	लॉग आउट
INVITED	आमंत्रित
CREATED	बनाया गया
UPDATED	बदला गया
SESSION	सत्र
REVOKE	रद्द करें
BOOTSTRAP	शुरुआती सेटअप
RECOVERY	रिकवरी
VERIFIED	सत्यापित
PASSKEY	पासकी
REGISTERED	पंजीकृत
Review moderation	समीक्षा का प्रबंधन
Publish only genuine, appropriate customer feedback. Approval does not change verified purchase status.	केवल असली और उचित ग्राहक राय प्रकाशित करें। मंज़ूरी देने से सत्यापित खरीद की स्थिति नहीं बदलती।
Refresh reviews	समीक्षाएँ ताज़ा करें
No reviews are waiting for moderation.	कोई समीक्षा मंज़ूरी की प्रतीक्षा में नहीं है।
Approved	स्वीकृत
Not published	प्रकाशित नहीं
Unpublish	प्रकाशन हटाएँ
Approve Review	समीक्षा स्वीकृत करें
`;
export const staffHindiMessages = Object.fromEntries(entries.trim().split('\n').map(line => line.split('\t')));
