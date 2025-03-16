const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Function to update user password or email 
exports.updateAuthUser = functions.https.onCall(async (data, context) => {
  // Security check - verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  }
  
  try {
    // Check if user is admin
    const adminDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can update users');
    }
    
    // Get data from request
    const { userId, password, email } = data;
    
    if (!userId) {
      throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
    }
    
    // Build update object
    const updates = {};
    if (password) updates.password = password;
    if (email) updates.email = email;
    
    if (Object.keys(updates).length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'No updates specified');
    }
    
    // Update the user
    await admin.auth().updateUser(userId, updates);
    
    // Return success
    return { success: true };
  } catch (error) {
    console.error('Update user error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Function to delete users (optional but useful)
exports.deleteUser = functions.https.onCall(async (data, context) => {
  // Security check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  }
  
  try {
    // Check if user is admin
    const adminDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can delete users');
    }
    
    const { userId } = data;
    
    if (!userId) {
      throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
    }
    
    // Delete user from Authentication
    await admin.auth().deleteUser(userId);
    
    // Delete user document from Firestore
    await admin.firestore().collection('users').doc(userId).delete();
    
    return { success: true };
  } catch (error) {
    console.error('Delete user error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
