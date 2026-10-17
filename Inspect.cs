
using System;
using System.Reflection;
using System.Linq;

class ReflectionInspector
{
    static void Main()
    {
        var dlls = new[]
        {
            "dll/RS.Enterprise.Common.ClientServer.ServiceContract.Model.dll",
            "dll/RS.Common.ClientServer.ServiceContract.AdminREST.dll",
            "dll/RS.Enterprise.Common.ClientServer.ServiceContract.Local.dll",
            "dll/RS.Common.ClientServer.ServiceContract.Admin.dll"
        };

        foreach (var d in dlls)
        {
            Console.WriteLine("=== Assembly: " + d + " ===");
            try
            {
                var asm = Assembly.LoadFrom(d);
                foreach (var t in asm.GetTypes().Where(t => t.IsInterface))
                {
                    Console.WriteLine("Interface: " + t.FullName);
                    foreach (var m in t.GetMethods())
                    {
                        var attrs = string.Join(", ", m.GetCustomAttributes().Select(a => a.GetType().Name));
                        Console.WriteLine($"  Method: {m.ReturnType.Name} {m.Name}({string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name))}) [{attrs}]");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error: " + ex.Message);
            }
        }
    }
}
