import os

def apply_fixes_to_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. ModelInfoData: Fix XML closing tag mismatch
    content = content.replace(
        '<b:MaximumModelNameLength>255</b:MaximumNameLength>',
        '<b:MaximumModelNameLength>255</b:MaximumModelNameLength>'
    )

    # 2. GetListOfModelDataFiles & GetListOfModelFilesAndFolders:
    # Return ValidationStatus enum: 'Success' instead of 'true'
    content = content.replace(
        '$"<{resultName}>true</{resultName}>"',
        '$"<{resultName}>Success</{resultName}>"'
    )

    # 3. BeginReadData:
    old_brd = (
        '        else if (methodName.Contains("BeginReadData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var accessGuid = Guid.NewGuid().ToString();\n'
        '            var creationDate = DateTime.UtcNow.ToString("o");\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning BeginReadData (Token: {accessGuid}) (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "BeginReadData", toUri, action, effectiveVersion, 200, $"BeginReadData: {accessGuid}");\n'
        '\n'
        '            responseXml = $"<BeginReadDataResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<BeginReadDataResult xmlns:b=\\"http://schemas.datacontract.org/2004/07/System.Collections.Generic\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" />" +\n'
        '                          "<dataAccessToken xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.ModelAccess\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\">" +\n'
        '                          $"<b:AccessGuid>{accessGuid}</b:AccessGuid>" +\n'
        '                          $"<b:CreationDate>{creationDate}</b:CreationDate>" +\n'
        '                          "</dataAccessToken>" +\n'
        '                          "<bPossibleConflictsExist>false</bPossibleConflictsExist>" +\n'
        '                          "</BeginReadDataResponse>";\n'
        '        }'
    )
    new_brd = (
        '        else if (methodName.Contains("BeginReadData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var accessGuid = Guid.NewGuid().ToString();\n'
        '            var episodeGuid = Guid.NewGuid().ToString();\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning BeginReadData (AccessGuid: {accessGuid}, Episode: {episodeGuid}) (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "BeginReadData", toUri, action, effectiveVersion, 200, $"BeginReadData: {accessGuid}");\n'
        '\n'
        '            responseXml = $"<BeginReadDataResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<BeginReadDataResult xmlns:b=\\"http://schemas.datacontract.org/2004/07/System.Collections.Generic\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" />" +\n'
        '                          "<dataAccessToken xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.ModelAccess\\" xmlns:c=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          $"<b:AccessGuid><c:Guid>{accessGuid}</c:Guid></b:AccessGuid>" +\n'
        '                          $"<b:CreationDate><c:GUIDValue><c:Guid>{episodeGuid}</c:Guid></c:GUIDValue></b:CreationDate>" +\n'
        '                          "</dataAccessToken>" +\n'
        '                          "<bPossibleConflictsExist>false</bPossibleConflictsExist>" +\n'
        '                          "</BeginReadDataResponse>";\n'
        '        }'
    )
    if old_brd in content:
        content = content.replace(old_brd, new_brd)
        print("Replaced BeginReadData in", path)
    else:
        print("old_brd not found in", path)

    # 4. BeginSave:
    old_bs = (
        '        else if (methodName.Contains("BeginSave", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("SaveRequestMessage", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning BeginSaveResponseMessage: true (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "BeginSave", toUri, action, effectiveVersion, 200, "BeginSaveResponseMessage: true");\n'
        '\n'
        '            responseXml = $"<BeginSaveResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          "<Result xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.TransactionalSafety\\">true</Result>" +\n'
        '                          "</BeginSaveResponseMessage>";\n'
        '        }'
    )
    new_bs = (
        '        else if (methodName.Contains("BeginSave", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("SaveRequestMessage", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning BeginSaveResponseMessage: true (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "BeginSave", toUri, action, effectiveVersion, 200, "BeginSaveResponseMessage: true");\n'
        '\n'
        '            responseXml = $"<BeginSaveResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          "<Result>true</Result>" +\n'
        '                          "</BeginSaveResponseMessage>";\n'
        '        }'
    )
    if old_bs in content:
        content = content.replace(old_bs, new_bs)
        print("Replaced BeginSave in", path)
    else:
        print("old_bs not found in", path)

    # 5. BeginWriteData:
    old_bwd = (
        '        else if (methodName.Contains("BeginWriteData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var accessGuid = Guid.NewGuid().ToString();\n'
        '            var creationDate = DateTime.UtcNow.ToString("o");\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning BeginWriteData (AccessGuid: {accessGuid}) (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "BeginWriteData", toUri, action, effectiveVersion, 200, $"BeginWriteData: {accessGuid}");\n'
        '\n'
        '            responseXml = $"<BeginWriteDataResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<BeginWriteDataResult xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.ModelAccess\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\">" +\n'
        '                          $"<b:AccessGuid>{accessGuid}</b:AccessGuid>" +\n'
        '                          $"<b:CreationDate>{creationDate}</b:CreationDate>" +\n'
        '                          "</BeginWriteDataResult>" +\n'
        '                          "</BeginWriteDataResponse>";\n'
        '        }'
    )
    new_bwd = (
        '        else if (methodName.Contains("BeginWriteData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var accessGuid = Guid.NewGuid().ToString();\n'
        '            var episodeGuid = Guid.NewGuid().ToString();\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning BeginWriteData (AccessGuid: {accessGuid}, EpisodeGuid: {episodeGuid}) (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "BeginWriteData", toUri, action, effectiveVersion, 200, $"BeginWriteData: {accessGuid}");\n'
        '\n'
        '            responseXml = $"<BeginWriteDataResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<BeginWriteDataResult xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.ModelAccess\\" xmlns:c=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          $"<b:AccessGuid><c:Guid>{accessGuid}</c:Guid></b:AccessGuid>" +\n'
        '                          $"<b:CreationDate><c:GUIDValue><c:Guid>{episodeGuid}</c:Guid></c:GUIDValue></b:CreationDate>" +\n'
        '                          "</BeginWriteDataResult>" +\n'
        '                          "</BeginWriteDataResponse>";\n'
        '        }'
    )
    if old_bwd in content:
        content = content.replace(old_bwd, new_bwd)
        print("Replaced BeginWriteData in", path)
    else:
        print("old_bwd not found in", path)

    # 6. WriteChunkDataFinish & WriteData:
    old_wd = (
        '        else if (methodName.Contains("WriteChunkDataFinish", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("WriteData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning {methodName}: true (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"{methodName}: true");\n'
        '\n'
        '            responseXml = $"<{methodName}Response xmlns=\\"{ns}\\"><{methodName}Result>true</{methodName}Result></{methodName}Response>";\n'
        '        }'
    )
    new_wd = (
        '        else if (methodName.Contains("WriteChunkDataFinish", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning WriteChunkDataFinish (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "WriteChunkDataFinish", toUri, action, effectiveVersion, 200, "WriteChunkDataFinish: OK");\n'
        '\n'
        '            responseXml = $"<WriteChunkDataFinishResponse xmlns=\\"{ns}\\" />";\n'
        '        }\n'
        '        else if (methodName.Contains("WriteData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var fileId = Guid.NewGuid().ToString();\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning WriteDataResponseMessage (FileId: {fileId})");\n'
        '            ServerState.RecordLog("WCF-TCP", "WriteData", toUri, action, effectiveVersion, 200, $"WriteData: {fileId}");\n'
        '\n'
        '            responseXml = $"<WriteDataResponseMessage xmlns=\\"http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message\\">" +\n'
        '                          $"<FileId>{fileId}</FileId>" +\n'
        '                          "</WriteDataResponseMessage>";\n'
        '        }'
    )
    if old_wd in content:
        content = content.replace(old_wd, new_wd)
        print("Replaced WriteChunkDataFinish in", path)
    else:
        print("old_wd not found in", path)

    # 7. CommitWriteData:
    old_cwd = (
        '        else if (methodName.Contains("CommitWriteData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var guidMatch = Regex.Match(requestBodyXml, @"([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})");\n'
        '            var guid = guidMatch.Success ? guidMatch.Value : "d3b07384-d113-4a1e-84b2-039c983a54b1";\n'
        '\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning CommitWriteData (GUID: {guid}) (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "CommitWriteData", toUri, action, effectiveVersion, 200, $"CommitWriteData OK (GUID: {guid})");\n'
        '\n'
        '            responseXml = $"<CommitWriteDataResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          "<b:ModelIdentity xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\" xmlns:c=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<c:IdentityGUID>" +\n'
        '                          $"<c:Guid>{guid}</c:Guid>" +\n'
        '                          "</c:IdentityGUID>" +\n'
        '                          "</b:ModelIdentity>" +\n'
        '                          "<b:ResourcePathInfoList xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\" xmlns:c=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\" i:nil=\\"true\\" />" +\n'
        '                          "</CommitWriteDataResponseMessage>";\n'
        '        }'
    )
    new_cwd = (
        '        else if (methodName.Contains("CommitWriteData", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var guidMatch = Regex.Match(requestBodyXml, @"([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})");\n'
        '            var guid = guidMatch.Success ? guidMatch.Value : "d3b07384-d113-4a1e-84b2-039c983a54b1";\n'
        '\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning CommitWriteData (GUID: {guid})");\n'
        '            ServerState.RecordLog("WCF-TCP", "CommitWriteData", toUri, action, effectiveVersion, 200, $"CommitWriteData OK (GUID: {guid})");\n'
        '\n'
        '            responseXml = "<CommitWriteDataResponseMessage xmlns=\\"http://Autodesk.RevitServer.Enterprise.Common.ClientServer.DataContract.Message\\" xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<ModelIdentity>" +\n'
        '                          "<b:IdentityGUID>" +\n'
        '                          $"<b:Guid>{guid}</b:Guid>" +\n'
        '                          "</b:IdentityGUID>" +\n'
        '                          "</ModelIdentity>" +\n'
        '                          "<ResourcePathInfoList xmlns:c=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" i:nil=\\"true\\" />" +\n'
        '                          "</CommitWriteDataResponseMessage>";\n'
        '        }'
    )
    if old_cwd in content:
        content = content.replace(old_cwd, new_cwd)
        print("Replaced CommitWriteData in", path)
    else:
        print("old_cwd not found in", path)

    # 8. CommitSave:
    old_cs = (
        '        else if (methodName.Contains("CommitSave", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var nowIso = DateTime.UtcNow.ToString("o");\n'
        '            var guidMatch = Regex.Match(requestBodyXml, @"([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})");\n'
        '            var guid = guidMatch.Success ? guidMatch.Value : "d3b07384-d113-4a1e-84b2-039c983a54b1";\n'
        '\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning CommitSave (GUID: {guid}, Timestamp: {nowIso}) (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "CommitSave", toUri, action, effectiveVersion, 200, $"CommitSave OK (GUID: {guid})");\n'
        '\n'
        '            responseXml = $"<CommitSaveResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          $"<b:CreationDate xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.TransactionalSafety\\">{nowIso}</b:CreationDate>" +\n'
        '                          "<b:ModelIdentity xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.TransactionalSafety\\" xmlns:c=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<c:IdentityGUID>" +\n'
        '                          $"<c:Guid>{guid}</c:Guid>" +\n'
        '                          "</c:IdentityGUID>" +\n'
        '                          "</b:ModelIdentity>" +\n'
        '                          "<b:ResourcePathInfoList xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.TransactionalSafety\\" xmlns:c=\\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\\" i:nil=\\"true\\" />" +\n'
        '                          "</CommitSaveResponseMessage>";\n'
        '        }'
    )
    new_cs = (
        '        else if (methodName.Contains("CommitSave", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var episodeGuid = Guid.NewGuid().ToString();\n'
        '            var guidMatch = Regex.Match(requestBodyXml, @"([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})");\n'
        '            var guid = guidMatch.Success ? guidMatch.Value : "d3b07384-d113-4a1e-84b2-039c983a54b1";\n'
        '\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning CommitSave (GUID: {guid}, EpisodeGuid: {episodeGuid}) (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "CommitSave", toUri, action, effectiveVersion, 200, $"CommitSave OK (GUID: {guid})");\n'
        '\n'
        '            responseXml = $"<CommitSaveResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          "<CreationDate xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:GUIDValue>" +\n'
        '                          $"<b:Guid>{episodeGuid}</b:Guid>" +\n'
        '                          "</b:GUIDValue>" +\n'
        '                          "</CreationDate>" +\n'
        '                          "<ModelIdentity xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:IdentityGUID>" +\n'
        '                          $"<b:Guid>{guid}</b:Guid>" +\n'
        '                          "</b:IdentityGUID>" +\n'
        '                          "</ModelIdentity>" +\n'
        '                          "<ResourcePathInfoList xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" i:nil=\\"true\\" />" +\n'
        '                          "</CommitSaveResponseMessage>";\n'
        '        }'
    )
    if old_cs in content:
        content = content.replace(old_cs, new_cs)
        print("Replaced CommitSave in", path)
    else:
        print("old_cs not found in", path)

    # 9. readAllNonElementPermissions:
    old_rnp = (
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
        '        }'
    )
    new_rnp = (
        '        else if (methodName.Contains("readAllNonElementPermissions", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var userMatch = Regex.Match(requestBodyXml, @"<(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)[^>]*>(.*?)</(?:[a-zA-Z0-9_]+:)?(?:UserName|user|userName)>", RegexOptions.IgnoreCase);\n'
        '            var uName = userMatch.Success ? userMatch.Groups[1].Value.Trim() : "user";\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning readAllNonElementPermissions (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", "readAllNonElementPermissions", toUri, action, effectiveVersion, 200, "readAllNonElementPermissions: OK");\n'
        '\n'
        '            responseXml = $"<readAllNonElementPermissionsResponse xmlns=\\"{ns}\\">" +\n'
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
        '        }'
    )
    if old_rnp in content:
        content = content.replace(old_rnp, new_rnp)
        print("Replaced readAllNonElementPermissions in", path)
    else:
        print("old_rnp not found in", path)

    # 10. writeAllElementPermissionsFromTempFile:
    old_waep = (
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
        '        }'
    )
    new_waep = (
        '        else if (methodName.Contains("writeAllElementPermissionsFromTempFile", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("writeElementPermissionsUpdates", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            var modelGuid = Guid.NewGuid().ToString();\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning {methodName} with newTransId (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"{methodName}: OK");\n'
        '\n'
        '            responseXml = $"<{methodName}Response xmlns=\\"{ns}\\">" +\n'
        '                          "<newTransId xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:PermsIdentity>" +\n'
        '                          "<b:IdentityGuid>" +\n'
        '                          $"<b:Guid>{modelGuid}</b:Guid>" +\n'
        '                          "</b:IdentityGuid>" +\n'
        '                          "</b:PermsIdentity>" +\n'
        '                          "<b:TransId>" +\n'
        '                          "<b:Id>1</b:Id>" +\n'
        '                          "</b:TransId>" +\n'
        '                          "</newTransId>" +\n'
        '                          $"</{methodName}Response>";\n'
        '        }'
    )
    if old_waep in content:
        content = content.replace(old_waep, new_waep)
        print("Replaced writeAllElementPermissionsFromTempFile in", path)
    else:
        print("old_waep not found in", path)

    # 11. writeAllNonElementPermissions and writeAllElementPermissions:
    old_perms = (
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
        '        }'
    )
    new_perms = (
        '        else if (methodName.Contains("writeAllElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("writeAllNonElementPermissions", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning {methodName} void (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"{methodName}: Success");\n'
        '\n'
        '            responseXml = $"<{methodName}Response xmlns=\\"{ns}\\" />";\n'
        '        }\n'
        '        else if (methodName.Contains("readAllElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("writeElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("readElementPermissions", StringComparison.OrdinalIgnoreCase) ||\n'
        '                 methodName.Contains("readAllPermissionsUpdates", StringComparison.OrdinalIgnoreCase))\n'
        '        {\n'
        '            Console.WriteLine($"[CoreWCF] -> Returning {methodName}: Success (Namespace: \'{ns}\')");\n'
        '            ServerState.RecordLog("WCF-TCP", methodName, toUri, action, effectiveVersion, 200, $"{methodName}: Success");\n'
        '\n'
        '            responseXml = $"<{methodName}Response xmlns=\\"{ns}\\">" +\n'
        '                          $"<{methodName}Result>true</{methodName}Result>" +\n'
        '                          $"</{methodName}Response>";\n'
        '        }'
    )
    if old_perms in content:
        content = content.replace(old_perms, new_perms)
        print("Replaced writeAllNonElementPermissions in", path)
    else:
        print("old_perms not found in", path)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done writing", path)

apply_fixes_to_file('Program.cs')
apply_fixes_to_file('dotnet-server/Program.cs')
