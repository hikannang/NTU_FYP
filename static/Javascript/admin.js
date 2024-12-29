import { db, auth } from "./firebase-config.js";
import { doc, getDoc, getDocs, collection, updateDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

const userList = document.getElementById('user-list');
const logoutButton = document.getElementById('logout-button');

// Ensure only admins can access this page
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists() && userDoc.data().role === "admin") {
        // Fetch all users
        const querySnapshot = await getDocs(collection(db, "users"));
        querySnapshot.forEach((doc) => {
          const userData = doc.data();
          const div = document.createElement('div');
          div.innerHTML = `
            <p>Email: ${userData.email}</p>
            <p>Role: ${userData.role}</p>
            <button onclick="makeAdmin('${doc.id}')">Make Admin</button>
            <hr>
          `;
          userList.appendChild(div);
        });
      } else {
        alert("Access denied. Admins only.");
        window.location.href = "/index.html";
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  } else {
    alert("You must be logged in.");
    window.location.href = "/index.html";
  }
});

// Function to make a user an admin
window.makeAdmin = async (userId) => {
  try {
    await updateDoc(doc(db, "users", userId), {
      role: "admin"
    });
    console.log("User role updated to admin:", userId);
    alert("User has been made an admin!");
    location.reload(); // Refresh the page to update the user list
  } catch (error) {
    console.error("Error updating user role:", error);
  }
};

// Logout functionality
logoutButton.addEventListener('click', () => {
  signOut(auth)
    .then(() => {
      alert('Logged out successfully!');
      window.location.href = "/index.html"; // Redirect to login page
    })
    .catch((error) => {
      alert('Error: ' + error.message);
    });
});