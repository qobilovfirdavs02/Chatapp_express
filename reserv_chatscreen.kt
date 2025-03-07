package com.example.chatapp.screens

import android.Manifest
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.chatapp.data.DataStoreManager
import com.example.chatapp.data.EditMessageRequest
import com.example.chatapp.data.Message
import com.example.chatapp.data.apiService
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import io.socket.client.Socket
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONArray
import org.json.JSONObject
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response
import java.io.File

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun ChatScreen(
    socket: Socket,
    currentUserId: String,
    dataStore: DataStoreManager,
    onLogout: () -> Unit
) {
    var messages by remember { mutableStateOf(listOf<Message>()) }
    var messageInput by remember { mutableStateOf("") }
    var userList by remember { mutableStateOf(listOf<String>()) }
    var selectedUser by remember { mutableStateOf<String?>(null) }
    var searchQuery by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val TAG = "ChatApp"
    val permissionState = rememberPermissionState(Manifest.permission.READ_EXTERNAL_STORAGE)
    val context = LocalContext.current

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            val file = File(context.cacheDir, "temp_file")
            context.contentResolver.openInputStream(it)?.use { input ->
                file.outputStream().use { output -> input.copyTo(output) }
            }
            val requestFile = file.asRequestBody("multipart/form-data".toMediaTypeOrNull())
            val body = MultipartBody.Part.createFormData("file", file.name, requestFile)
            if (selectedUser != null) {
                apiService.uploadFile(body, currentUserId, selectedUser!!).enqueue(object : Callback<com.example.chatapp.data.AuthResponse> {
                    override fun onResponse(call: Call<com.example.chatapp.data.AuthResponse>, response: Response<com.example.chatapp.data.AuthResponse>) {
                        Log.d(TAG, "Fayl yuklandi: ${response.body()?.message}")
                    }
                    override fun onFailure(call: Call<com.example.chatapp.data.AuthResponse>, t: Throwable) {
                        Log.e(TAG, "Fayl yuklash xatosi: ${t.message}")
                    }
                })
            }
        }
    }

    // Socket.io ulanishi
    LaunchedEffect(currentUserId) {
        if (socket.connected()) {
            socket.emit("setUsername", currentUserId)
            Log.d(TAG, "Username darhol yuborildi: $currentUserId")
        } else {
            socket.connect()
            socket.on("connect") {
                socket.emit("setUsername", currentUserId)
                Log.d(TAG, "Socket qayta ulandi, Username yuborildi: $currentUserId")
            }
        }

        socket.on("userList") { args ->
            val jsonArray = args[0] as JSONArray
            userList = (0 until jsonArray.length()).map { jsonArray.getString(it) }
            Log.d(TAG, "UserList yangilandi: $userList")
        }
        socket.on("chat message") { args ->
            val message = args[0] as JSONObject
            val newMessage = Message(
                id = message.getInt("id"),
                content = message.getString("content"),
                sender = message.getString("sender"),
                receiver = message.getString("receiver"),
                created_at = message.getString("created_at"),
                type = message.getString("type")
            )
            messages = messages + newMessage
            scope.launch { if (messages.isNotEmpty()) listState.scrollToItem(messages.size - 1) }
            Log.d(TAG, "Yangi xabar: ${newMessage.content}")
        }
        socket.on("message_deleted") { args ->
            val id = args[0].toString().toInt()
            messages = messages.filter { it.id != id }
            Log.d(TAG, "Xabar o‘chirildi: $id")
        }
        socket.on("message_edited") { args ->
            val data = args[0] as JSONObject
            val id = data.getInt("id")
            val content = data.getString("content")
            messages = messages.map { if (it.id == id) it.copy(content = content) else it }
            Log.d(TAG, "Xabar tahrirlandi: $id, $content")
        }
    }

    LaunchedEffect(selectedUser) {
        if (selectedUser != null) {
            apiService.getMessages(currentUserId, selectedUser!!).enqueue(object : Callback<List<Message>> {
                override fun onResponse(call: Call<List<Message>>, response: Response<List<Message>>) {
                    messages = response.body() ?: emptyList()
                    scope.launch { if (messages.isNotEmpty()) listState.scrollToItem(messages.size - 1) }
                }
                override fun onFailure(call: Call<List<Message>>, t: Throwable) {
                    Log.e(TAG, "Xabarlar tarixini yuklashda xatolik: ${t.message}")
                }
            })
        }
    }

    if (selectedUser == null) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color(0xFF6200EE), Color(0xFF03DAC6))))
                .padding(16.dp)
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = {
                    searchQuery = it
                    apiService.searchUsers(it).enqueue(object : Callback<List<String>> {
                        override fun onResponse(call: Call<List<String>>, response: Response<List<String>>) {
                            userList = response.body() ?: emptyList()
                        }
                        override fun onFailure(call: Call<List<String>>, t: Throwable) {
                            Log.e(TAG, "Qidiruv xatosi: ${t.message}")
                        }
                    })
                },
                label = { Text("Foydalanuvchi qidirish") },
                modifier = Modifier.fillMaxWidth()
            )
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 8.dp)
            ) {
                items(userList.filter { it != currentUserId }) { user ->
                    Text(
                        text = user,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedUser = user }
                            .padding(8.dp),
                        color = Color.White,
                        fontSize = 18.sp
                    )
                }
            }
            Button(onClick = onLogout) { Text("Chiqish") }
        }
    } else {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color(0xFF6200EE), Color(0xFF03DAC6))))
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Button(onClick = { selectedUser = null }) { Text("Orqaga") }
                Spacer(modifier = Modifier.width(8.dp))
                Text("Chat: $selectedUser", color = Color.White, fontSize = 20.sp)
            }
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 8.dp),
                reverseLayout = true
            ) {
                items(messages.reversed()) { message ->
                    ChatMessage(
                        message = message,
                        isMine = message.sender == currentUserId,
                        onDelete = {
                            apiService.deleteMessage(message.id).enqueue(object : Callback<com.example.chatapp.data.AuthResponse> {
                                override fun onResponse(call: Call<com.example.chatapp.data.AuthResponse>, response: Response<com.example.chatapp.data.AuthResponse>) {
                                    Log.d(TAG, "Xabar o‘chirildi: ${message.id}")
                                }
                                override fun onFailure(call: Call<com.example.chatapp.data.AuthResponse>, t: Throwable) {
                                    Log.e(TAG, "O‘chirish xatosi: ${t.message}")
                                }
                            })
                        },
                        onEdit = { newContent ->
                            apiService.editMessage(message.id, EditMessageRequest(newContent)).enqueue(object : Callback<com.example.chatapp.data.AuthResponse> {
                                override fun onResponse(call: Call<com.example.chatapp.data.AuthResponse>, response: Response<com.example.chatapp.data.AuthResponse>) {
                                    Log.d(TAG, "Xabar tahrirlandi: ${message.id}")
                                }
                                override fun onFailure(call: Call<com.example.chatapp.data.AuthResponse>, t: Throwable) {
                                    Log.e(TAG, "Tahrirlash xatosi: ${t.message}")
                                }
                            })
                        }
                    )
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .imePadding(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = messageInput,
                    onValueChange = { messageInput = it },
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 8.dp),
                    placeholder = { Text("Xabar yozing") }
                )
                Button(
                    onClick = {
                        if (messageInput.isNotEmpty() && selectedUser != null) {
                            socket.emit("chat message", messageInput, currentUserId, selectedUser)
                            messageInput = ""
                        }
                    },
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Green)
                ) { Text("Yuborish", color = Color.White) }
                Spacer(modifier = Modifier.width(8.dp))
                IconButton(onClick = {
                    if (permissionState.status.isGranted) {
                        pickFile.launch("*/*")
                    } else {
                        permissionState.launchPermissionRequest()
                    }
                }) { Text("+", color = Color.White, fontSize = 20.sp) }
            }
        }
    }
}

@Composable
fun ChatMessage(
    message: Message,
    isMine: Boolean,
    onDelete: () -> Unit,
    onEdit: (String) -> Unit
) {
    var showOptions by remember { mutableStateOf(false) }
    var isEditing by remember { mutableStateOf(false) }
    var editedContent by remember { mutableStateOf(message.content) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clickable { showOptions = !showOptions },
        horizontalAlignment = if (isMine) Alignment.End else Alignment.Start
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = message.sender, fontSize = 12.sp, color = Color.White)
        }
        if (isEditing) {
            OutlinedTextField(
                value = editedContent,
                onValueChange = { editedContent = it },
                modifier = Modifier
                    .width(200.dp)
                    .padding(4.dp)
            )
            Button(onClick = {
                onEdit(editedContent)
                isEditing = false
            }) { Text("Saqlash") }
        } else {
            Card(
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (isMine) Color(0xFF6200EE) else Color(0xFF424242)
                )
            ) {
                when (message.type) {
                    "text" -> Text(
                        text = message.content,
                        modifier = Modifier.padding(8.dp),
                        color = Color.White,
                        fontSize = 16.sp
                    )
                    "file" -> Text("Fayl: ${message.content}", modifier = Modifier.padding(8.dp), color = Color.White)
                    "audio" -> Text("Ovozli xabar: ${message.content}", modifier = Modifier.padding(8.dp), color = Color.White)
                    "video" -> Text("Video: ${message.content}", modifier = Modifier.padding(8.dp), color = Color.White)
                }
            }
        }
        if (showOptions) {
            Row {
                Button(onClick = onDelete) { Text("O‘chirish") }
                Spacer(modifier = Modifier.width(4.dp))
                Button(onClick = { isEditing = true }) { Text("Tahrirlash") }
            }
        }
    }
}