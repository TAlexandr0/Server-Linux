import os

def fix_program(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Fix ListSubFoldersAndModels modelList timestamp
    content = content.replace(
        '${m.Name}|{m.ModelGuid}|{m.VersionNumber}</d4p1:anyType>',
        '${m.Name}|{m.ModelGuid}|{nowFileTime}</d4p1:anyType>'
    )

    # 2. Fix GetCentralServerVersion
    old_csv = (
        '            responseXml = $"<GetCentralServerVersionResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<GetCentralServerVersionResult xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:HistoryCheckInfo i:nil=\\"true\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" />" +\n'
        '                          "<b:Version>1</b:Version>" +\n'
        '                          "</GetCentralServerVersionResult>" +\n'
        '                          "</GetCentralServerVersionResponse>";'
    )
    new_csv = (
        '            responseXml = $"<GetCentralServerVersionResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<GetCentralServerVersionResult xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:Build>0</b:Build>" +\n'
        '                          "<b:Major>2025</b:Major>" +\n'
        '                          "<b:Minor>0</b:Minor>" +\n'
        '                          "<b:Revision>0</b:Revision>" +\n'
        '                          "<b:Version>2025.0</b:Version>" +\n'
        '                          "</GetCentralServerVersionResult>" +\n'
        '                          "</GetCentralServerVersionResponse>";'
    )
    content = content.replace(old_csv, new_csv)

    # 3. Fix ModelDataFormatVersion
    old_mdfv = (
        '            responseXml = $"<ModelDataFormatVersionResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<ModelDataFormatVersionResult xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">Latest</ModelDataFormatVersionResult>" +\n'
        '                          "</ModelDataFormatVersionResponse>";'
    )
    new_mdfv = (
        '            responseXml = $"<ModelDataFormatVersionResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<ModelDataFormatVersionResult>Latest</ModelDataFormatVersionResult>" +\n'
        '                          "</ModelDataFormatVersionResponse>";'
    )
    content = content.replace(old_mdfv, new_mdfv)

    # 4. Fix PermissionsFormatVersion
    old_pfv = (
        '            responseXml = $"<PermissionsFormatVersionResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<PermissionsFormatVersionResult xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">Latest</PermissionsFormatVersionResult>" +\n'
        '                          "</PermissionsFormatVersionResponse>";'
    )
    new_pfv = (
        '            responseXml = $"<PermissionsFormatVersionResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<PermissionsFormatVersionResult>Latest</PermissionsFormatVersionResult>" +\n'
        '                          "</PermissionsFormatVersionResponse>";'
    )
    content = content.replace(old_pfv, new_pfv)

    # 5. Fix ModelExists duplicate tag
    old_me = (
        '            responseXml = $"<{opName}Response xmlns=\\"{ns}\\">" +\n'
        '                          $"<{opName}Result>{(exists ? \\"true\\" : \\"false\\")}</{opName}Result>" +\n'
        '                          $"<ModelExistsResult>{(exists ? \\"true\\" : \\"false\\")}</ModelExistsResult>" +\n'
        '                          $"</{opName}Response>";'
    )
    new_me = (
        '            responseXml = $"<{opName}Response xmlns=\\"{ns}\\">" +\n'
        '                          $"<{opName}Result>{(exists ? \\"true\\" : \\"false\\")}</{opName}Result>" +\n'
        '                          $"</{opName}Response>";'
    )
    content = content.replace(old_me, new_me)

    # 6. Fix IsModelLockedByAdmin
    old_mla = (
        '            responseXml = $"<IsModelLockedByAdminResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<IsModelLockedByAdminResult xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">" +\n'
        '                          "<ModelLockedByAdmin>false</ModelLockedByAdmin>" +\n'
        '                          "<LockedForReadOnly>false</LockedForReadOnly>" +\n'
        '                          "<Version>1</Version>" +\n'
        '                          "</IsModelLockedByAdminResult>" +\n'
        '                          "<ModelLockedByAdmin xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">false</ModelLockedByAdmin>" +\n'
        '                          "<LockedForReadOnly xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">false</LockedForReadOnly>" +\n'
        '                          "<Version xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">1</Version>" +\n'
        '                          "</IsModelLockedByAdminResponse>";'
    )
    new_mla = (
        '            responseXml = $"<IsModelLockedByAdminResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          "<ModelLockedByAdmin xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">false</ModelLockedByAdmin>" +\n'
        '                          "<LockedForReadOnly xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">false</LockedForReadOnly>" +\n'
        '                          "<Version xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">1</Version>" +\n'
        '                          "</IsModelLockedByAdminResponseMessage>";'
    )
    content = content.replace(old_mla, new_mla)

    # 7. Fix LatestModelVersion
    old_lmv = (
        '            responseXml = $"<LatestModelVersionResponse xmlns=\\"{ns}\\">" +\n'
        '                          "<LatestModelVersionResult xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Model\\">" +\n'
        '                          "<b:HistoryCheckInfo i:nil=\\"true\\" xmlns:i=\\"http://www.w3.org/2001/XMLSchema-instance\\" />" +\n'
        '                          "<b:Version>1</b:Version>" +\n'
        '                          "</LatestModelVersionResult>" +\n'
        '                          "<Version xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">1</Version>" +\n'
        '                          "</LatestModelVersionResponse>";'
    )
    new_lmv = (
        '            responseXml = $"<LatestModelVersionResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          "<Version xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">1</Version>" +\n'
        '                          "</LatestModelVersionResponseMessage>";'
    )
    content = content.replace(old_lmv, new_lmv)

    # 8. Fix GetSize
    old_gs = (
        '            responseXml = $"<GetSizeResponse xmlns=\\"{ns}\\">" +\n'
        '                          $"<GetSizeResult>{size}</GetSizeResult>" +\n'
        '                          $"<Size xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">{size}</Size>" +\n'
        '                          $"<FilePath xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">{cleanPath}</FilePath>" +\n'
        '                          "</GetSizeResponse>";'
    )
    new_gs = (
        '            responseXml = $"<GetSizeResponseMessage xmlns=\\"{ns}\\">" +\n'
        '                          $"<FilePath xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">{cleanPath}</FilePath>" +\n'
        '                          $"<Size xmlns=\\"http://Autodesk.RevitServer.Enterprise.DataContract.Message\\">{size}</Size>" +\n'
        '                          "</GetSizeResponseMessage>";'
    )
    content = content.replace(old_gs, new_gs)

    # 9. Fix GetLocalServerVersion in LocalService
    old_glsv = 'responseXml = $"<GetLocalServerVersionResponse xmlns=\\"{ns}\\"><GetLocalServerVersionResult>1</GetLocalServerVersionResult></GetLocalServerVersionResponse>";'
    new_glsv = 'responseXml = $"<GetLocalServerVersionResponse xmlns=\\"{ns}\\"><GetLocalServerVersionResult xmlns:b=\\"http://Autodesk.RevitServer.Enterprise.DataContract.System\\"><b:Build>0</b:Build><b:Major>2025</b:Major><b:Minor>0</b:Minor><b:Revision>0</b:Revision><b:Version>2025.0</b:Version></GetLocalServerVersionResult></GetLocalServerVersionResponse>";'
    content = content.replace(old_glsv, new_glsv)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Successfully updated {filepath}')

fix_program('Program.cs')
fix_program('dotnet-server/Program.cs')
