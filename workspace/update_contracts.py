import os

def update_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. lockPermissions: add out param lockTally and clean result tag
    old_lp = (
        '        else if (methodName.Contains("lockPermissions", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning lockPermissions: Locked (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "lockPermissions", toUri, action, effectiveVersion, 200, "lockPermissions: Locked");\n'
        '\n'
        '            responseXml = $"<lockPermissionsResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<lockPermissionsResult xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Locks\\">Locked</lockPermissionsResult>" +\n'
        '                          "</lockPermissionsResponse>";\n'
        '        }'
    )

    new_lp = (
        '        else if (methodName.Contains("lockPermissions", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning lockPermissions: Locked, lockTally=1 (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "lockPermissions", toUri, action, effectiveVersion, 200, "lockPermissions: Locked (lockTally: 1)");\n'
        '\n'
        '            responseXml = $"<lockPermissionsResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<lockPermissionsResult>Locked</lockPermissionsResult>" +\n'
        '                          "<lockTally>1</lockTally>" +\n'
        '                          "</lockPermissionsResponse>";\n'
        '        }'
    )
    if old_lp in content:
        content = content.replace(old_lp, new_lp)
        print("Replaced lockPermissions in", path)
    else:
        print("old_lp not found in", path)

    # 2. unlockPermissions: remove invalid xmlns on unlockPermissionsResult
    old_up = (
        '        else if (methodName.Contains("unlockPermissions", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning unlockPermissions: Unlocked (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "unlockPermissions", toUri, action, effectiveVersion, 200, "unlockPermissions: Unlocked");\n'
        '\n'
        '            responseXml = $"<unlockPermissionsResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<unlockPermissionsResult xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Locks\\">Unlocked</unlockPermissionsResult>" +\n'
        '                          "</unlockPermissionsResponse>";\n'
        '        }'
    )

    new_up = (
        '        else if (methodName.Contains("unlockPermissions", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning unlockPermissions: Unlocked (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "unlockPermissions", toUri, action, effectiveVersion, 200, "unlockPermissions: Unlocked");\n'
        '\n'
        '            responseXml = $"<unlockPermissionsResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<unlockPermissionsResult>Unlocked</unlockPermissionsResult>" +\n'
        '                          "</unlockPermissionsResponse>";\n'
        '        }'
    )
    if old_up in content:
        content = content.replace(old_up, new_up)
        print("Replaced unlockPermissions in", path)
    else:
        print("old_up not found in", path)

    # 3. CommitPermissions: void return in WCF
    old_cp = (
        '        else if (methodName.Contains("CommitPermissions", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning CommitPermissions: Success (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "CommitPermissions", toUri, action, effectiveVersion, 200, "CommitPermissions: Success");\n'
        '\n'
        '            responseXml = $"<CommitPermissionsResponse xmlns=\\"{ns}\\"><CommitPermissionsResult>true</CommitPermissionsResult></CommitPermissionsResponse>";\n'
        '        }'
    )

    new_cp = (
        '        else if (methodName.Contains("CommitPermissions", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning CommitPermissions: Success (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "CommitPermissions", toUri, action, effectiveVersion, 200, "CommitPermissions: Success");\n'
        '\n'
        '            responseXml = $"<CommitPermissionsResponse xmlns=\\"{ns}\\" />";\n'
        '        }'
    )
    if old_cp in content:
        content = content.replace(old_cp, new_cp)
        print("Replaced CommitPermissions in", path)
    else:
        print("old_cp not found in", path)

    # 4. readAllUsernames: UserTable DataContract with IdToNameList and UserName
    old_rau = (
        '        else if (methodName.Contains("readAllUsernames", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var userMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)[^>]*>(.*?)</(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)>", RegexOptions.IgnoreCase);\n'
        '            var uName = userMatch.Success ? userMatch.Groups[1].Value.Trim() : "user";\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning readAllUsernames for \'{uName}\' (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "readAllUsernames", toUri, action, effectiveVersion, 200, $"readAllUsernames: {uName}");\n'
        '\n'
        '            responseXml = $"<readAllUsernamesResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<readAllUsernamesResult>true</readAllUsernamesResult>" +\n'
        '                          "<userTable xmlns:b=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\">" +\n'
        '                          $"<b:string>{uName}</b:string>" +\n'
        '                          "</userTable>" +\n'
        '                          "</readAllUsernamesResponse>";\n'
        '        }'
    )

    new_rau = (
        '        else if (methodName.Contains("readAllUsernames", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var userMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)[^>]*>(.*?)</(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)>", RegexOptions.IgnoreCase);\n'
        '            var uName = userMatch.Success ? userMatch.Groups[1].Value.Trim() : "user";\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning readAllUsernames for \'{uName}\' (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "readAllUsernames", toUri, action, effectiveVersion, 200, $"readAllUsernames: {uName}");\n'
        '\n'
        '            responseXml = $"<readAllUsernamesResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<readAllUsernamesResult>true</readAllUsernamesResult>" +\n'
        '                          "<userTable xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:IdToNameList>" +\n'
        '                          "<b:UserName>" +\n'
        '                          $"<b:Name>{uName}</b:Name>" +\n'
        '                          "</b:UserName>" +\n'
        '                          "</b:IdToNameList>" +\n'
        '                          "</userTable>" +\n'
        '                          "</readAllUsernamesResponse>";\n'
        '        }'
    )
    if old_rau in content:
        content = content.replace(old_rau, new_rau)
        print("Replaced readAllUsernames in", path)
    else:
        print("old_rau not found in", path)

    # 5. readAllWorksetCheckoutRecords
    old_raw = (
        '        else if (methodName.Contains("readAllWorksetCheckoutRecords", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning readAllWorksetCheckoutRecords: true (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "readAllWorksetCheckoutRecords", toUri, action, effectiveVersion, 200, "readAllWorksetCheckoutRecords: true");\n'
        '\n'
        '            responseXml = $"<readAllWorksetCheckoutRecordsResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<readAllWorksetCheckoutRecordsResult>true</readAllWorksetCheckoutRecordsResult>" +\n'
        '                          "<worksetCheckoutRecords xmlns:b=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" />" +\n'
        '                          "</readAllWorksetCheckoutRecordsResponse>";\n'
        '        }'
    )

    new_raw = (
        '        else if (methodName.Contains("readAllWorksetCheckoutRecords", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning readAllWorksetCheckoutRecords: true (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "readAllWorksetCheckoutRecords", toUri, action, effectiveVersion, 200, "readAllWorksetCheckoutRecords: true");\n'
        '\n'
        '            responseXml = $"<readAllWorksetCheckoutRecordsResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<readAllWorksetCheckoutRecordsResult>true</readAllWorksetCheckoutRecordsResult>" +\n'
        '                          "<worksetCheckoutRecords xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\" />" +\n'
        '                          "</readAllWorksetCheckoutRecordsResponse>";\n'
        '        }\n'
        '        else if (methodName.Contains("readAllEditingRequestRecords", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning readAllEditingRequestRecords: true (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "readAllEditingRequestRecords", toUri, action, effectiveVersion, 200, "readAllEditingRequestRecords: true");\n'
        '\n'
        '            responseXml = $"<readAllEditingRequestRecordsResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<readAllEditingRequestRecordsResult>true</readAllEditingRequestRecordsResult>" +\n'
        '                          "<requestsPack xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:Requests xmlns:c=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\" />" +\n'
        '                          "<b:ReadableElementInfoMap xmlns:c=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\" />" +\n'
        '                          "</requestsPack>" +\n'
        '                          "</readAllEditingRequestRecordsResponse>";\n'
        '        }'
    )
    if old_raw in content:
        content = content.replace(old_raw, new_raw)
        print("Replaced readAllWorksetCheckoutRecords in", path)
    else:
        print("old_raw not found in", path)

    # 6. UploadFinish, EndReadData, AbortWriteData: void returns
    old_uf = (
        '        else if (methodName.Contains("UploadFinish", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning UploadFinish: true (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "UploadFinish", toUri, action, effectiveVersion, 200, "UploadFinish: true");\n'
        '\n'
        '            responseXml = $"<UploadFinishResponse xmlns=\\"{ns}\\"><UploadFinishResult>true</UploadFinishResult></UploadFinishResponse>";\n'
        '        }'
    )

    new_uf = (
        '        else if (methodName.Contains("UploadFinish", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning UploadFinish: true (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "UploadFinish", toUri, action, effectiveVersion, 200, "UploadFinish: true");\n'
        '\n'
        '            responseXml = $"<UploadFinishResponse xmlns=\\"{ns}\\" />";\n'
        '        }'
    )
    if old_uf in content:
        content = content.replace(old_uf, new_uf)
        print("Replaced UploadFinish in", path)
    else:
        print("old_uf not found in", path)

    # 7. EndReadData: void return
    old_erd = (
        '        else if (methodName.Contains("EndReadData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning EndReadData (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "EndReadData", toUri, action, effectiveVersion, 200, "EndReadData OK");\n'
        '\n'
        '            responseXml = $"<EndReadDataResponse xmlns=\\"{ns}\\"><EndReadDataResult>true</EndReadDataResult></EndReadDataResponse>";\n'
        '        }'
    )

    new_erd = (
        '        else if (methodName.Contains("EndReadData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning EndReadData (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "EndReadData", toUri, action, effectiveVersion, 200, "EndReadData OK");\n'
        '\n'
        '            responseXml = $"<EndReadDataResponse xmlns=\\"{ns}\\" />";\n'
        '        }'
    )
    if old_erd in content:
        content = content.replace(old_erd, new_erd)
        print("Replaced EndReadData in", path)
    else:
        print("old_erd not found in", path)

    # 8. AbortWriteData: void return
    old_awd = (
        '        else if (methodName.Contains("AbortWriteData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning AbortWriteData (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "AbortWriteData", toUri, action, effectiveVersion, 200, "AbortWriteData OK");\n'
        '\n'
        '            responseXml = $"<AbortWriteDataResponse xmlns=\\"{ns}\\"><AbortWriteDataResult>true</AbortWriteDataResult></AbortWriteDataResponse>";\n'
        '        }'
    )

    new_awd = (
        '        else if (methodName.Contains("AbortWriteData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning AbortWriteData (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "AbortWriteData", toUri, action, effectiveVersion, 200, "AbortWriteData OK");\n'
        '\n'
        '            responseXml = $"<AbortWriteDataResponse xmlns=\\"{ns}\\" />";\n'
        '        }'
    )
    if old_awd in content:
        content = content.replace(old_awd, new_awd)
        print("Replaced AbortWriteData in", path)
    else:
        print("old_awd not found in", path)

    # 9. writeAllElementPermissions / readAllNonElementPermissions
    old_perms = (
        '        // Element permissions and worksets streaming\n'
        '        else if (methodName.Contains("writeAllElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("readAllElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("writeElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("readElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("writeAllNonElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("readAllNonElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("readAllPermissionsUpdates", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning {methodName}: Success (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"{methodName}: Success");\n'
        '\n'
        '            responseXml = $"<{methodName}Response xmlns=\\"{ns}\\">" +\n'
        '                          $"<{methodName}Result>true</{methodName}Result>" +\n'
        '                          $"</{methodName}Response>";\n'
        '        }\n'
        '        else if (methodName.Contains("RelinquishPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("CheckoutAndRelinquishWorksets", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("checkoutElements", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("GrantDenyRetractEditingRequests", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning {methodName}: Success (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"{methodName}: Success");\n'
        '\n'
        '            responseXml = $"<{methodName}Response xmlns=\\"{ns}\\">" +\n'
        '                          $"<{methodName}Result xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" />" +\n'
        '                          $"</{methodName}Response>";\n'
        '        }'
    )

    new_perms = (
        '        // Element permissions and worksets streaming\n'
        '        else if (methodName.Contains("readAllNonElementPermissions", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var userMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)[^>]*>(.*?)</(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)>", RegexOptions.IgnoreCase);\n'
        '            var uName = userMatch.Success ? userMatch.Groups[1].Value.Trim() : "user";\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning readAllNonElementPermissions (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "readAllNonElementPermissions", toUri, action, effectiveVersion, 200, "readAllNonElementPermissions: true");\n'
        '\n'
        '            responseXml = $"<readAllNonElementPermissionsResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<readAllNonElementPermissionsResult>true</readAllNonElementPermissionsResult>" +\n'
        '                          "<userTable xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:IdToNameList>" +\n'
        '                          "<b:UserName>" +\n'
        '                          $"<b:Name>{uName}</b:Name>" +\n'
        '                          "</b:UserName>" +\n'
        '                          "</b:IdToNameList>" +\n'
        '                          "</userTable>" +\n'
        '                          "<worksetPerms xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\" />" +\n'
        '                          "<requestsPack xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:Requests xmlns:c=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\" />" +\n'
        '                          "<b:ReadableElementInfoMap xmlns:c=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\" />" +\n'
        '                          "</requestsPack>" +\n'
        '                          "</readAllNonElementPermissionsResponse>";\n'
        '        }\n'
        '        else if (methodName.Contains("writeAllElementPermissionsFromTempFile", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("writeElementPermissionsUpdates", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning {methodName}: true with newTransId (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"{methodName}: true");\n'
        '\n'
        '            responseXml = $"<{methodName}Response xmlns=\\"{ns}\\">" +\n'
        '                          $"<{methodName}Result>true</{methodName}Result>" +\n'
        '                          "<newTransId xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:PermsIdentity>0</b:PermsIdentity>" +\n'
        '                          "<b:TransId>1</b:TransId>" +\n'
        '                          "</newTransId>" +\n'
        '                          $"</{methodName}Response>";\n'
        '        }\n'
        '        else if (methodName.Contains("writeAllElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("readAllElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("writeElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("readElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("writeAllNonElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("readAllPermissionsUpdates", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning {methodName}: Success (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"{methodName}: Success");\n'
        '\n'
        '            responseXml = $"<{methodName}Response xmlns=\\"{ns}\\">" +\n'
        '                          $"<{methodName}Result>true</{methodName}Result>" +\n'
        '                          $"</{methodName}Response>";\n'
        '        }\n'
        '        else if (methodName.Contains("CheckoutAndRelinquishWorksets", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning CheckoutAndRelinquishWorksetsResponseMessage (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "CheckoutAndRelinquishWorksets", toUri, action, effectiveVersion, 200, "CheckoutAndRelinquishWorksetsResponseMessage");\n'
        '\n'
        '            responseXml = $"<CheckoutAndRelinquishWorksetsResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          "<b:PermissionsWorksetsUpdateData xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" i:nil=\\"true\\" />" +\n'
        '                          "</CheckoutAndRelinquishWorksetsResponseMessage>";\n'
        '        }\n'
        '        else if (methodName.Contains("checkoutElements", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning CheckoutElementsResponseMessage (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "checkoutElements", toUri, action, effectiveVersion, 200, "CheckoutElementsResponseMessage");\n'
        '\n'
        '            responseXml = $"<CheckoutElementsResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          "<b:Checkedout xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">true</b:Checkedout>" +\n'
        '                          "</CheckoutElementsResponseMessage>";\n'
        '        }\n'
        '        else if (methodName.Contains("GrantDenyRetractEditingRequests", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning GrantDenyRetractEditingRequestsResponseMessage (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "GrantDenyRetractEditingRequests", toUri, action, effectiveVersion, 200, "GrantDenyRetractEditingRequestsResponseMessage");\n'
        '\n'
        '            responseXml = $"<GrantDenyRetractEditingRequestsResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          "<b:PermissionsRequestsUpdateData xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" i:nil=\\"true\\" />" +\n'
        '                          "</GrantDenyRetractEditingRequestsResponseMessage>";\n'
        '        }\n'
        '        else if (methodName.Contains("RelinquishPermissions", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning PermissionsUpdatesResponseMessage (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "RelinquishPermissions", toUri, action, effectiveVersion, 200, "PermissionsUpdatesResponseMessage");\n'
        '\n'
        '            responseXml = $"<PermissionsUpdatesResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          "<b:PermissionsUpdatesData xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" i:nil=\\"true\\" />" +\n'
        '                          "</PermissionsUpdatesResponseMessage>";\n'
        '        }'
    )
    if old_perms in content:
        content = content.replace(old_perms, new_perms)
        print("Replaced perms in", path)
    else:
        print("old_perms not found in", path)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done updating", path)

update_file("Program.cs")
update_file("dotnet-server/Program.cs")
